import Razorpay from "razorpay";
import Subscription from "../../models/subscriptionModel.js";
import { handleRazorpayError } from "../../utils/razorpayErrorHandler.js";

export const rzpInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const createSubscriptionService = async (userId, planId) => {
    // Check for any subscription that isn't halted/cancelled
    const existingSubscription = await Subscription.findOne({
        userId,
        status: { $in: ["active", "created", "pending", "past_due"] },
    });

    if (existingSubscription) {
        // If it's already active, show the specific error
        if (existingSubscription.status === "active") {
            const error = new Error("You already have an active subscription");
            error.status = 400;
            throw error;
        }
        
        // Only reuse if it's the SAME plan. If user picked a different plan, we need a new subscription!
        if (existingSubscription.status === "created" && existingSubscription.planId === planId) {
            return { 
                subscriptionId: existingSubscription.razorpaySubscriptionId,
                razorpayKeyId: process.env.RAZORPAY_KEY_ID
            };
        }
        
        // If it was 'created' but for a DIFFERENT plan, we'll let it create a new one below.
        // We should ideally mark the old 'created' one as cancelled/invalid, but for now 
        // just allowing a new one is safer for the user to proceed.
    }

    const isYearly = ["plan_Su5qr7eEef1lwX", "plan_Su5t5DYChiXkwM"].includes(planId);

    const session = await Subscription.startSession();
    session.startTransaction();

    try {
        const newSubscription = await rzpInstance.subscriptions.create({
            plan_id: planId,
            total_count: isYearly ? 10 : 60,
            notes: {
                userId: userId.toString(),
            },
        });

        try {
            const [subscription] = await Subscription.create([{
                razorpaySubscriptionId: newSubscription.id,
                planId,
                userId,
            }], { session });

            await session.commitTransaction();
            session.endSession();

            return { 
                subscriptionId: newSubscription.id,
                razorpayKeyId: process.env.RAZORPAY_KEY_ID
            };

        } catch (dbError) {
             // If DB write fails, cancel the external subscription to prevent billing ghost accounts
            console.error("DB Save failed, cancelling Razorpay subscription:", newSubscription.id);
            await rzpInstance.subscriptions.cancel(newSubscription.id).catch(err => 
                console.error("CRITICAL: Failed to cancel orphaned subscription:", newSubscription.id, err)
            );
            throw dbError;
        }

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("Error in createSubscriptionService:", error);
        throw handleRazorpayError(error, "Failed to create subscription");
    }
};
