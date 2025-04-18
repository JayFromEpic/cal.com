import dayjs from "@calcom/dayjs";
import { sendCreditBalanceLowWarningEmails } from "@calcom/emails";
import { IS_SMS_CREDITS_ENABLED } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { getTranslation } from "@calcom/lib/server";
import { prisma } from "@calcom/prisma";
import { CreditType } from "@calcom/prisma/enums";

import { InternalTeamBilling } from "../../billing/teams/internal-team-billing";

const log = logger.getSubLogger({ prefix: ["[credits]"] });

// done, write test
export async function chargeCredits({
  userId,
  teamId,
  credits,
  bookingUid,
  smsSid,
}: {
  userId?: number;
  teamId?: number;
  credits: number | null;
  bookingUid: string;
  smsSid: string;
}) {
  let teamToCharge: number | null = credits === 0 && teamId ? teamId : null;
  let userToCharge: number | null = credits === 0 && userId ? userId : null;
  let creditType: CreditType = CreditType.ADDITIONAL;
  let remainingCredits;
  if (credits !== 0) {
    const result = await getTeamToCharge({
      credits: credits ?? 1, // if we don't have exact credits, we check for at east 1 credit available
      userId,
      teamId,
    });
    teamToCharge = result?.teamId ?? null;
    userToCharge = result?.userId ?? null;
    creditType = result?.creditType ?? creditType;
    remainingCredits = result?.availableCredits;
  }

  if (!teamToCharge && !userToCharge) {
    log.error("No team or user found to charge. No credit expense log created");
    return null;
  }

  await createExpenseLog({
    bookingUid,
    smsSid,
    teamId: teamToCharge,
    userId: !teamToCharge ? userToCharge : null,
    credits,
    creditType,
  });

  if (credits) {
    await handleLowCreditBalance({
      userId: userToCharge,
      teamId: teamToCharge,
      remainingCredits,
    });
  }

  return {
    teamId: teamToCharge,
    userId: teamToCharge ? null : userToCharge,
  };
}

export async function hasAvailableCredits({
  userId,
  teamId,
}: {
  userId?: number | null;
  teamId?: number | null;
}) {
  if (!IS_SMS_CREDITS_ENABLED) return true;

  if (teamId) {
    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
      },
      select: {
        credits: {
          select: {
            limitReachedAt: true,
          },
        },
      },
    });

    if (team && !team.credits?.limitReachedAt) {
      return true;
    }
  }

  if (userId) {
    const team = await getTeamWithAvailableCredits(userId);
    return !!teamId;
  }

  return false;
}

async function getTeamWithAvailableCredits(userId: number, credits?: number) {
  const teams = await prisma.membership.findMany({
    where: {
      userId,
      accepted: true,
    },
  });

  //check if user is member of team that has available credits
  for (const team of teams) {
    const teamWithCredits = await prisma.team.findUnique({
      where: {
        id: team.id,
      },
      select: {
        credits: {
          select: {
            limitReachedAt: true,
          },
        },
      },
    });

    if (teamWithCredits && !teamWithCredits.credits?.limitReachedAt) {
      if (!credits) return { teamId: teamWithCredits.credits };
      const allCredits = await getAllCreditsForTeam(team.id);
      if (allCredits.totalRemainingMonthlyCredits + allCredits.additionalCredits >= credits)
        return {
          teamId: teamWithCredits.credits,
          availableCredits: allCredits.totalRemainingMonthlyCredits + allCredits.additionalCredits,
          creditType:
            allCredits.totalRemainingMonthlyCredits > 0 ? CreditType.MONTHLY : CreditType.ADDITIONAL,
        };
    }
  }
  return null;
}

/*
  credits can be 0, then we just check for available credits
*/
export async function getTeamToCharge({
  credits,
  userId,
  teamId,
}: {
  credits: number;
  userId?: number | null;
  teamId?: number | null;
}) {
  // todo

  if (teamId) {
    let creditBalance = await prisma.creditBalance.findFirst({
      where: {
        teamId,
      },
    });

    if (!creditBalance) {
      creditBalance = await prisma.creditBalance.create({
        data: { teamId },
      });
    }

    return {
      teamId,
      availableCredits: 0, //todo: get available credits, montlhy + additional - credits
      creditType: CreditType.ADDITIONAL, // todo
    };
  }

  if (userId) {
    const team = await getTeamWithAvailableCredits(userId, credits);
    if (team?.availableCredits) return team;
  }

  return null;
}

// done, write test
async function createExpenseLog(props: {
  bookingUid: string;
  smsSid: string;
  teamId: number | null;
  userId: number | null;
  credits: number | null;
  creditType: CreditType;
}) {
  const { credits, creditType, bookingUid, smsSid, teamId, userId } = props;

  if (!userId && !teamId) return;

  let creditBalance: { id: string } | null = null;

  if (teamId) {
    creditBalance = await prisma.creditBalance.findUnique({
      where: {
        teamId: teamId,
      },
    });
  } else if (userId) {
    creditBalance = await prisma.creditBalance.findUnique({
      where: {
        userId: userId,
      },
    });
  }

  if (!creditBalance) {
    creditBalance = await prisma.creditBalance.create({
      data: {
        teamId: teamId,
        userId: teamId ? null : userId,
      },
    });
  }

  if (credits && creditType === CreditType.ADDITIONAL) {
    prisma.creditBalance.update({
      where: {
        id: creditBalance.id,
      },
      data: {
        additionalCredits: {
          decrement: credits,
        },
      },
    });
  }

  if (creditBalance) {
    // also track logs with undefined credits (will be set on the cron job)
    await prisma.creditExpenseLog.create({
      data: {
        creditBalanceId: creditBalance.id,
        credits,
        creditType,
        date: new Date(),
        bookingUid,
        smsSid,
      },
    });
  }
}

// some more todos + tests
/*
Called when we know the exact amount of credits to be charged:
- Sets `limitReachedAt` and `warningSentAt`
- Sends warning email if balance is low
- Sends limit reached email
- cancels all already scheduled SMS (from the next two hours)
*/
export async function handleLowCreditBalance({
  userId,
  teamId,
  remainingCredits = 0,
}: {
  userId?: number | null; // either userId or teamId is given never both
  teamId?: number | null;
  remainingCredits?: number;
}) {
  if (userId && !teamId) {
    // check if user is on a team/org plan
    const team = await prisma.membership.findFirst({
      where: {
        userId,
        accepted: true,
      },
    });

    // user paid with left over personal credits, but is on a team/org plan, so we don't need to handle low credit balance
    if (team) return;

    // todo: don't hard code credits amount
    const warningLimitUser = 200;
    if (remainingCredits < warningLimitUser) {
      const creditBalance = await prisma.creditBalance.findUnique({
        where: { userId },
      });

      if (creditBalance?.limitReachedAt) return; // user has already reached limit

      if (remainingCredits <= 0) {
        await prisma.creditBalance.update({
          where: { userId },
          data: {
            limitReachedAt: new Date(),
          },
        });

        //await sendDisableSmsEmail(userId);
        //cancelScheduledSmsAndScheduleEmails({ userId: parsedUserId }); --> only from user worklfows
        return;
      }

      if (creditBalance?.warningSentAt) return; // user has already sent warning email

      // user balance below 200 credits (2$)
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) return;

      await sendCreditBalanceLowWarningEmails({
        balance: remainingCredits,
        user: {
          name: user.name ?? "",
          email: user.email,
          t: await getTranslation(user.locale ?? "en", "common"),
        },
      });

      await prisma.creditBalance.update({
        where: { userId },
        data: {
          warningSentAt: new Date(),
        },
      });
    }
    return;
  }

  if (teamId) {
    const { totalMonthlyCredits } = await getAllCreditsForTeam(teamId);
    const warningLimit = totalMonthlyCredits * 0.2;
    if (remainingCredits < warningLimit) {
      const creditBalance = await prisma.creditBalance.findUnique({
        where: { teamId },
      });

      if (dayjs(creditBalance?.limitReachedAt).isAfter(dayjs().startOf("month"))) return; // team has already reached limit this month

      if (remainingCredits <= 0) {
        //await sendDisableSmsEmail(teamId);
        await prisma.creditBalance.update({
          where: { teamId },
          data: {
            limitReachedAt: new Date(),
          },
        });

        //cancelScheduledSmsAndScheduleEmails({ teamId }); --> team workflows, and also user workflows if the user has no credits or other team with credits
        return;
      }

      if (dayjs(creditBalance?.warningSentAt).isAfter(dayjs().startOf("month"))) return; // team has already sent warning email this month

      // team balance below 20% of total monthly credits
      //await sendWarningEmail(teamId);
      await prisma.creditBalance.update({
        where: { teamId },
        data: {
          warningSentAt: new Date(),
        },
      });
    }
  }
}

// some more todos + test
export async function getMonthlyCredits(teamId: number) {
  const team = await prisma.team.findUnique({
    where: {
      id: teamId,
    },
    select: {
      members: {
        select: {
          accepted: true,
        },
      },
      id: true,
      metadata: true,
      parentId: true,
      isOrganization: true,
    },
  });

  if (!team) return 0;

  const teamBillingService = new InternalTeamBilling(team);
  const subscriptionStatus = await teamBillingService.getSubscriptionStatus();

  if (subscriptionStatus !== "active" && subscriptionStatus !== "past_due") {
    return 0;
  }

  const activeMembers = team.members.filter((member) => member.accepted).length;

  // todo: where do I get price per seat from? --> different for team and org
  const pricePerSeat = 15;
  const totalMonthlyCredits = activeMembers * ((pricePerSeat / 2) * 100);

  return totalMonthlyCredits;
}

export async function getAllCreditsForTeam(teamId: number) {
  const creditBalance = await prisma.creditBalance.findUnique({
    where: {
      teamId,
    },
    select: {
      additionalCredits: true,
      expenseLogs: {
        where: {
          date: {
            gte: dayjs().startOf("month").toDate(),
            lte: new Date(),
          },
          creditType: CreditType.MONTHLY,
        },
        select: {
          date: true,
          credits: true,
        },
      },
    },
  });

  const totalMonthlyCredits = await getMonthlyCredits(teamId);
  const totalMonthlyCreditsUsed =
    creditBalance?.expenseLogs.reduce((sum, log) => sum + (log?.credits ?? 0), 0) || 0;

  return {
    totalMonthlyCredits,
    totalRemainingMonthlyCredits: totalMonthlyCredits - totalMonthlyCreditsUsed,
    additionalCredits: creditBalance?.additionalCredits ?? 0,
  };
}
