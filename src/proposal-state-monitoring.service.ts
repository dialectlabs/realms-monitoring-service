import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
  Change,
  DialectSdkNotification,
  Monitors,
  Pipelines,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';

import { DialectSdk } from './dialect-sdk';
import { NOTIF_TYPE_ID_PROPOSALS } from './main';
import { ProposalData, RealmsService } from './realms.service';
import {
  ProgramAccount,
  Proposal,
  ProposalState,
  Realm,
} from '@solana/spl-governance';
import { fmtTokenAmount, RealmMints } from './realms-repository';


interface ProposalVotingStats {
  yesCount: number;
  noCount: number;
  relativeYesCount: number;
  relativeNoCount: number;
}

@Injectable()
export class ProposalStateChangeMonitoringService implements OnModuleInit {
  constructor(
    private readonly sdk: DialectSdk,
    private readonly realmsService: RealmsService,
  ) {}

  private readonly logger = new Logger(
    ProposalStateChangeMonitoringService.name,
  );

  onModuleInit() {
    const monitor = Monitors.builder({
      sdk: this.sdk,
    })
      .defineDataSource<ProposalData>()
      .poll(
        async (subscribers) => this.realmsService.getProposalData(subscribers),
        Duration.fromObject({ seconds: 30 }),
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
              p1.account.state === p2.account.state || !isChangedToTerminalState
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
          const notification = this.constructNotification(
            context.origin.realm.account,
            realmId,
            value,
          );
          this.logger.log(
            `Sending message for ${context.origin.realmSubscribers.length} subscribers of realm ${realmId}
      ${notification.title}
      ${notification.message}
                  `,
          );
          return notification;
        },
        { dispatch: 'multicast', to: ({ origin }) => origin.realmSubscribers },
      )
      //       .custom<DialectSdkNotification>(
      //         ({ value, context }) => {
      //           const realmId: string = context.origin.realm.pubkey.toBase58();
      //           const notification = this.constructNotification(
      //             context.origin.realm.account,
      //             realmId,
      //             value,
      //           );
      //           this.logger.log(
      //             `Sending message for ${context.origin.realmSubscribers.length} subscribers of realm ${realmId}
      // ${notification.title}
      // ${notification.message}
      //             `,
      //           );
      //           return notification;
      //         },
      //         new ConsoleNotificationSink(),
      //         { dispatch: 'multicast', to: ({ origin }) => origin.realmSubscribers },
      //       )
      .and()
      .build();
    monitor.start();
  }

  private constructNotification(
    realm: Realm & RealmMints,
    realmId: string,
    { current: { pubkey, account } }: Change<ProgramAccount<Proposal>>,
  ): DialectSdkNotification {
    const realmName: string = realm.name;
    const proposalLink = `https://realms.today/dao/${realmId}/proposal/${pubkey.toBase58()}`;
    if (account.state === ProposalState.ExecutingWithErrors) {
      return {
        title: `Proposal for ${realmName} is executing with errors`,
        message: `Proposal ${account.name} for ${realmName} is executing with errors: ${proposalLink}`,
      };
    }
    if (account.state === ProposalState.Cancelled) {
      return {
        title: `Proposal for ${realmName} is canceled`,
        message: `Proposal ${account.name} for ${realmName} is canceled: ${proposalLink}`,
      };
    }
    if (account.state === ProposalState.Completed) {
      return {
        title: `Proposal for ${realmName} is completed`,
        message: `Proposal ${account.name} for ${realmName} is completed: ${proposalLink}`,
      };
    }

    const { yesCount, noCount, relativeYesCount, relativeNoCount } =
      getVotingStats(account, realm);

    if (account.state === ProposalState.Succeeded) {
      return {
        title: `Proposal for ${realmName} is succeeded`,
        message: `✅ Proposal ${
          account.name
        } for ${realmName} is succeeded with ${relativeYesCount.toFixed(
          1,
        )}% of 👍 votes (${yesCount} 👍 / ${noCount} 👎): ${proposalLink}`,
      };
    }
    if (account.state === ProposalState.Defeated) {
      return {
        title: `Proposal for ${realmName} is defeated`,
        message: `❌ Proposal ${
          account.name
        } for ${realmName} is defeated with ${relativeNoCount.toFixed(
          1,
        )}% of 👎 votes (${yesCount} 👍 / ${noCount} 👎): ${proposalLink}`,
      };
    }
    return {
      title: `Proposal for ${realmName} ${
        ProposalState[account.state]?.toString() ?? 'changed'
      }`,
      message: `Proposal ${account.name} for ${realmName} is ${
        ProposalState[account.state]?.toString() ?? 'changed'
      }: ${proposalLink}`,
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
