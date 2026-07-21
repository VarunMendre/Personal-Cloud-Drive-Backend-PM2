import Subscription from "../../models/subscriptionModel.js";
import { rzpInstance } from "./createSubscription.js";
import { CustomError } from "../../utils/CustomError.js";

export const getSubscriptionInvoiceService = async (userId) => {
  // get the most recent active subscription
  const subscription = await Subscription.findOne({
    userId: userId,
    status: { $in: ["active", "past_due", "created", "authenticated", "pending"] },
  }).sort({ createdAt: -1 });

  if (!subscription) {
    throw new CustomError("No active subscription found", 404);
  }

  // fetch invoices from razorpay for this subscription
  const invoice = await rzpInstance.invoices.all({
    subscription_id: subscription.razorpaySubscriptionId,
  });

  // find the most recent paid invoice
  const lastInvoice = invoice.items.find((inv) => inv.status === "paid");

  if (!lastInvoice || !lastInvoice.short_url) {
    throw new CustomError("No paid invoice found", 404);
  }

  return { invoiceUrl: lastInvoice.short_url };
};


