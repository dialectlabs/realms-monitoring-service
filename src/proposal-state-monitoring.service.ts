import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
  Change,
  DialectSdkNotification,
  Monitors,
  Pipelines,
} from '@dialectlabs/monitor';
import { Duration } from 'luxon';

import { DialectSdk } from './dialect-sdk';
import { ProposalData, RealmsService } from './realms.service';
import {
  ProgramAccount,
  Proposal,
  ProposalState,
} from '@solana/spl-governance';

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
      .notify()
      .dialectSdk(
        ({ value, context }) => {
          const realmName: string = context.origin.realm.account.name;
          const realmId: string = context.origin.realm.pubkey.toBase58();
          const notification = this.constructNotification(
            realmName,
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
      .and()
      .build();
    monitor.start();
  }

  private constructNotification(
    realmName: string,
    realmId: string,
    { current: { pubkey, account } }: Change<ProgramAccount<Proposal>>,
  ): DialectSdkNotification {
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
    const yesVotesCount = account.getYesVoteCount().toNumber();
    const noVotesCount = account.getNoVoteCount().toNumber();
    const totalVotesCount = yesVotesCount + noVotesCount;
    if (account.state === ProposalState.Succeeded) {
      const yesVotePercentage =
        totalVotesCount === 0
          ? 0
          : Math.round((yesVotesCount / totalVotesCount) * 100);
      return {
        title: `✅ Proposal for ${realmName} is succeeded`,
        message: `✅ Proposal ${account.name} for ${realmName} is succeeded with ${yesVotePercentage}% of votes (${yesVotesCount} 👍 / ${noVotesCount} 👎): ${proposalLink}`,
      };
    }
    if (account.state === ProposalState.Defeated) {
      const noVotePercentage =
        totalVotesCount === 0
          ? 0
          : Math.round((noVotesCount / totalVotesCount) * 100);
      return {
        title: `❌ Proposal for ${realmName} is defeated`,
        message: `❌ Proposal ${account.name} for ${realmName} is defeated with ${noVotePercentage}% of votes (${yesVotesCount} 👍 / ${noVotesCount} 👎): ${proposalLink}`,
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
