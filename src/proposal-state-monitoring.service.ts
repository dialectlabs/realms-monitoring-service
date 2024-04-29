import { Injectable, Logger } from '@nestjs/common';

import {
  Change,
  DialectSdkNotification,
  Monitor,
  Monitors,
  Pipelines,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';

import { NOTIF_TYPE_ID_PROPOSALS } from './main';
import { ProposalData, RealmsService } from './realms.service';
import {
  ProgramAccount,
  Proposal,
  ProposalState,
  Realm,
} from '@solana/spl-governance';
import { CachingEventType, fmtTokenAmount, RealmMints } from './realms-cache';
import { OnEvent } from '@nestjs/event-emitter';
import {
  DappMessageActionType,
  DappMessageLinkAction,
  DappMessageLinksAction,
  DialectSdk,
} from '@dialectlabs/sdk';
import { Solana } from '@dialectlabs/blockchain-sdk-solana';
import { amountToShortString } from './formatting-utilts';

interface ProposalVotingStats {
  yesCount: number;
  noCount: number;
  relativeYesCount: number;
  relativeNoCount: number;
}

@Injectable()
export class ProposalStateChangeMonitoringService {
  private readonly monitor: Monitor<ProposalData> = this.createMonitor();

  constructor(
    private readonly sdk: DialectSdk<Solana>,
    private readonly realmsService: RealmsService,
  ) {}

  private readonly logger = new Logger(
    ProposalStateChangeMonitoringService.name,
  );

  @OnEvent(CachingEventType.InitialCachingFinished)
  onInitialCachingFinished() {
    this.monitor.start().catch(this.logger.error);
  }

  createMonitor() {
    return (
      Monitors.builder({
        sdk: this.sdk,
      })
        .defineDataSource<ProposalData>()
        .poll(
          async (subscribers) =>
            this.realmsService.getProposalData(subscribers),
          Duration.fromObject({ minutes: 1 }),
        )
        .transform<ProgramAccount<Proposal>, Change<ProgramAccount<Proposal>>>({
          keys: ['proposal'],
          pipelines: [
            Pipelines.change((p1, p2) => {
              const terminalStates: ProposalState[] = [
                ProposalState.ExecutingWithErrors,
                ProposalState.Cancelled,
                ProposalState.Succeeded,
                ProposalState.Defeated,
                ProposalState.Completed,
              ];
              const isChangedToTerminalState = Boolean(
                terminalStates.find((it) => p2.account.state === it),
              );
              return (
                p1.account.state === p2.account.state ||
                !isChangedToTerminalState
              );
            }),
          ],
        })
        .notify({
          type: {
            id: NOTIF_TYPE_ID_PROPOSALS,
          },
        })
        .dialectSdk(
          ({ value, context }) => {
            const realmId: string = context.origin.realm.pubkey.toBase58();
            const realmName: string = context.origin.realm.account.name;
            const notification = this.constructNotification(
              context.origin.realm.account,
              realmId,
              value,
            );
            this.logger.log(
              `Sending message for ${context.origin.realmSubscribers.length} subscribers of realm ${realmName}
        ${notification.title}
        ${notification.message}
                    `,
            );
            return notification;
          },
          {
            dispatch: 'multicast',
            to: ({ origin }) => origin.realmSubscribers,
          },
        )
        // .custom<DialectSdkNotification>(
        //   ({ value, context }) => {
        //     const realmId: string = context.origin.realm.pubkey.toBase58();
        //     const notification = this.constructNotification(
        //       context.origin.realm.account,
        //       realmId,
        //       value,
        //     );
        //     this.logger.log(
        //       `Sending message for ${context.origin.realmSubscribers.length} subscribers of realm ${realmId}
        // ${notification.title}
        // ${notification.message}
        //             `,
        //     );
        //     return notification;
        //   },
        //   new ConsoleNotificationSink(),
        //   {
        //     dispatch: 'multicast',
        //     to: ({ origin }) => origin.realmSubscribers,
        //   },
        // )
        .and()
        .build()
    );
  }

  private constructNotification(
    realm: Realm & RealmMints,
    realmId: string,
    { current: { pubkey, account } }: Change<ProgramAccount<Proposal>>,
  ): DialectSdkNotification {
    const realmName: string = realm.name;
    const proposalLink = `https://realms.today/dao/${realmId}/proposal/${pubkey.toBase58()}`;
    const actions: DappMessageLinksAction = {
      type: DappMessageActionType.LINK,
      links: [
        {
          label: 'View Proposal',
          url: proposalLink,
        },
      ],
    };
    if (account.state === ProposalState.ExecutingWithErrors) {
      return {
        title: `Proposal for ${realmName} is executing with errors`,
        message: `Proposal ${account.name} for ${realmName} is executing with errors`,
        actions,
      };
    }
    if (account.state === ProposalState.Cancelled) {
      return {
        title: `Proposal for ${realmName} is canceled`,
        message: `Proposal ${account.name} for ${realmName} is canceled`,
        actions,
      };
    }

    if (account.state === ProposalState.Completed) {
      return {
        title: `Proposal for ${realmName} is completed`,
        message: `Proposal ${account.name} for ${realmName} is completed`,
        actions,
      };
    }

    const { yesCount, noCount, relativeYesCount, relativeNoCount } =
      getVotingStats(account, realm);

    const yesVotesFormatted = amountToShortString(yesCount);
    const noVotesFormatted = amountToShortString(noCount);
    if (account.state === ProposalState.Succeeded) {
      return {
        title: `Proposal for ${realmName} is succeeded`,
        message: `✅ Proposal ${
          account.name
        } for ${realmName} is succeeded with ${relativeYesCount.toFixed(
          1,
        )}% of 👍 votes (${yesVotesFormatted} 👍 / ${noVotesFormatted} 👎)`,
        actions,
      };
    }
    if (account.state === ProposalState.Defeated) {
      return {
        title: `Proposal for ${realmName} is defeated`,
        message: `❌ Proposal ${
          account.name
        } for ${realmName} is defeated with ${relativeNoCount.toFixed(
          1,
        )}% of 👎 votes (${yesVotesFormatted} 👍 / ${noVotesFormatted} 👎)`,
        actions,
      };
    }
    return {
      title: `Proposal for ${realmName} ${
        ProposalState[account.state]?.toString() ?? 'changed'
      }`,
      message: `Proposal ${account.name} for ${realmName} is ${
        ProposalState[account.state]?.toString() ?? 'changed'
      }`,
      actions,
    };
  }
}

function getVotingStats(
  proposal: Proposal,
  realm: Realm & RealmMints,
): ProposalVotingStats {
  const isMultiProposal = proposal?.options?.length > 1;
  const proposalMint =
    proposal?.governingTokenMint.toBase58() === realm.communityMint.toBase58()
      ? realm.mint
      : realm.councilMint;

  if (!proposalMint) {
    return {
      yesCount: 0,
      relativeYesCount: 0,
      noCount: 0,
      relativeNoCount: 0,
    };
  }
  const yesCount = !isMultiProposal
    ? fmtTokenAmount(proposal.getYesVoteCount(), proposalMint.decimals)
    : 0;
  const noCount = !isMultiProposal
    ? fmtTokenAmount(proposal.getNoVoteCount(), proposalMint.decimals)
    : 0;

  const totalVoteCount = yesCount + noCount;

  const getRelativeVoteCount = (voteCount: number) =>
    totalVoteCount === 0 ? 0 : (voteCount / totalVoteCount) * 100;

  const relativeYesCount = getRelativeVoteCount(yesCount);
  const relativeNoCount = getRelativeVoteCount(noCount);

  return {
    yesCount,
    noCount,
    relativeYesCount,
    relativeNoCount,
  };
}
