import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Change, Monitors, Pipelines } from '@dialectlabs/monitor';
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
              ProposalState.Succeeded,
              ProposalState.Completed,
              ProposalState.Defeated,
              ProposalState.Cancelled,
              ProposalState.ExecutingWithErrors,
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
          const message: string = this.constructMessage(
            realmName,
            realmId,
            value,
          );
          this.logger.log(
            `Sending message for ${context.origin.realmSubscribers.length} subscribers of realm ${realmId} : ${message}`,
          );
          return {
            title: `📜 Proposal for ${realmName} is ${
              ProposalState[value.current.account.state]?.toLowerCase() ??
              'changed'
            }`,
            message,
          };
        },
        { dispatch: 'multicast', to: ({ origin }) => origin.realmSubscribers },
      )
      .and()
      .build();
    monitor.start();
  }

  private constructMessage(
    realmName: string,
    realmId: string,
    proposalStateChange: Change<ProgramAccount<Proposal>>,
  ): string {
    const proposal = proposalStateChange.current;
    const proposalAccount = proposal.account;
    const proposalLink = `https://realms.today/dao/${realmId}/proposal/${proposal.pubkey.toBase58()}`;
    if (proposalAccount.state === ProposalState.ExecutingWithErrors) {
      return `Proposal ${proposalAccount.name} for ${realmName} is executing with errors: ${proposalLink}`;
    }
    const yesVotesCount = proposalAccount.getYesVoteCount().toNumber();
    const noVotesCount = proposalAccount.getNoVoteCount().toNumber();
    const totalVotesCount = yesVotesCount + noVotesCount;
    if (proposalAccount.state === ProposalState.Succeeded) {
      const yesVotePercentage = Math.round(
        (yesVotesCount / totalVotesCount) * 100,
      );
      return `Proposal ${proposalAccount.name} for ${realmName} has succeeded with ${yesVotePercentage}% of votes (${yesVotesCount} yes votes, ${noVotesCount} no votes): ${proposalLink}`;
    }
    if (proposalAccount.state === ProposalState.Defeated) {
      const noVotePercentage = Math.round(
        (noVotesCount / totalVotesCount) * 100,
      );
      return `Proposal ${proposalAccount.name} for ${realmName} has defeated with ${noVotePercentage}% of votes (${yesVotesCount} yes votes, ${noVotesCount} no votes): ${proposalLink}`;
    }
    return `Proposal ${proposalAccount.name} for ${realmName} has ${
      ProposalState[proposalAccount.state]?.toString().toLowerCase() ??
      'changed'
    }: ${proposalLink}`;
  }
}
