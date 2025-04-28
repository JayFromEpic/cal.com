import stripe from "@calcom/features/ee/payments/server/stripe";
import { WEBAPP_URL } from "@calcom/lib/constants";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";

import type { TBuyCreditsSchema } from "./buyCredits.schema";

type BuyCreditsOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TBuyCreditsSchema;
};

export const buyCreditsHandler = async ({ ctx, input }: BuyCreditsOptions) => {
  const { quantity, teamId } = input;

  const redirect_uri = `${WEBAPP_URL}/settings/teams/${teamId}/billing`;

  const session = await stripe.checkout.sessions.create({
    line_items: [{ price: process.env.NEXT_PUBLIC_STRIPE_CREDITS_PRICE_ID, quantity }],
    mode: "payment",
    client_reference_id: ctx.user.id.toString(),
    success_url: redirect_uri,
    cancel_url: redirect_uri,
    metadata: {
      teamId: teamId.toString(),
    },
  });

  return { sessionUrl: session.url };
};
