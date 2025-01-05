import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import moment from "moment-timezone";

import * as utils from "../../lib/utils";
import { order_status, next_transitions, order_status_keys, timeEventMapping } from "../../common/constant";
import { sendMessageToCustomer } from "../notify";

import { getStripeAccount, getStripeOrderRecord, getHash } from "../stripe/intent";
import { orderUpdateData, updateDataOnorderUpdate } from "../../lib/types";
import { validateOrderUpadte } from "../../lib/validator";

const getMgsKey = (status: number, isEC: boolean, timeEstimated?: admin.firestore.Timestamp) => {
  if (status === order_status.order_accepted) {
    return isEC ? "msg_ec_order_accepted" : "msg_order_accepted";
  }
  if (status === order_status.ready_to_pickup) {
    if (isEC) {
      return "msg_ec_cooking_completed";
    } else {
      if (timeEstimated) {
        const diffDay = (moment().toDate().getTime() - timeEstimated.toDate().getTime()) / 1000 / 3600 / 24;
        console.log("timeEstimated_diff_days = " + String(diffDay));
        if (diffDay < 1) {
          return "msg_cooking_completed";
        }
      }
    }
  }
  return null;
};

const getPaymentIntent = async (
  db: admin.firestore.Firestore,
  restaurantOwnerUid: string,
  order: any,
  transaction: admin.firestore.Transaction,
  stripeRef: admin.firestore.DocumentReference,
) => {
  const stripe = utils.get_stripe();
  const stripeAccount = await getStripeAccount(db, restaurantOwnerUid);
  // just for stripe payment
  if (order.payment.stripe !== "pending") {
    throw new functions.https.HttpsError("failed-precondition", "Stripe process was done.");
  }
  const stripeRecord = await getStripeOrderRecord(transaction, stripeRef);
  const paymentIntentId = stripeRecord.paymentIntent.id;

  const idempotencyKey = getHash([order.id, paymentIntentId].join("-"));
  return await stripe.paymentIntents.capture(
    paymentIntentId,
    { expand: ["latest_charge"] },
    {
      idempotencyKey,
      stripeAccount,
    },
  );
};

// This function is called by admins (restaurant operators) to update the status of order
export const update = async (db: admin.firestore.Firestore, data: orderUpdateData, context: functions.https.CallableContext) => {
  const ownerUid = utils.validate_owner_admin_auth(context);
  const uid = utils.validate_auth(context);
  const { restaurantId, orderId, status, timeEstimated } = data;
  utils.required_params({ restaurantId, orderId, status });

  const validateResult = validateOrderUpadte(data);
  if (!validateResult.result) {
    console.error("orderUpdate", validateResult.errors);
    throw new functions.https.HttpsError("invalid-argument", "Validation Error.");
  }
  if (utils.is_subAccount(context)) {
    await utils.validate_sub_account_request(db, uid, ownerUid, restaurantId);
  }

  try {
    const restaurantData = await utils.get_restaurant(db, restaurantId);
    if (restaurantData.uid !== ownerUid) {
      throw new functions.https.HttpsError("permission-denied", "The user does not have an authority to perform this operation.");
    }
    const restaurantOwnerUid = restaurantData.uid;

    const orderRef = db.doc(`restaurants/${restaurantId}/orders/${orderId}`);
    const stripeRef = db.doc(`restaurants/${restaurantId}/orders/${orderId}/system/stripe`);

    const result = await db.runTransaction(async (transaction) => {
      const order = (await transaction.get(orderRef)).data();
      if (!order) {
        throw new functions.https.HttpsError("invalid-argument", "This order does not exist.");
      }
      order.id = orderId;

      const isStripeProcess = order.status === order_status.order_placed && order.payment && order.payment.stripe !== "canceled";
      const nextStatus = next_transitions[order.status];
      if (!nextStatus || nextStatus !== status) {
        throw new functions.https.HttpsError("failed-precondition", "It is not possible to change state from the current state.", order.status);
      }
      const paymentIntent = isStripeProcess ? await getPaymentIntent(db, restaurantOwnerUid, order, transaction, stripeRef) : {};

      // for backward compatibility
      if (
        (order.status === order_status.ready_to_pickup || order.status === order_status.order_accepted) &&
        order.payment &&
        order.payment.stripe &&
        order.payment.stripe === "pending"
      ) {
        throw new functions.https.HttpsError("permission-denied", "Paid order can not be change like this", status);
      }

      const customerUid = order.uid;
      const stripeReadOnlyRef = db.doc(`/users/${customerUid}/owner/${restaurantOwnerUid}/readonly/stripe`);
      const stripeReadOnly = (await transaction.get(stripeReadOnlyRef)).data();

      const stripeSystemRef = db.doc(`/users/${customerUid}/owner/${restaurantOwnerUid}/system/stripe`);
      const stripeSystem = (await transaction.get(stripeSystemRef)).data();

      // everything are ok
      const updateTimeKey = timeEventMapping[order_status_keys[status]];
      const updateData: updateDataOnorderUpdate = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        [updateTimeKey]: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (isStripeProcess) {
        updateData.payment = {
          stripe: "confirmed",
        };
      }
      if (status === order_status.order_accepted) {
        updateData.timeEstimated = timeEstimated ? new admin.firestore.Timestamp(timeEstimated.seconds, timeEstimated.nanoseconds) : order.timePlaced;
        updateData.timePickupForQuery = updateData.timeEstimated;
        order.timeEstimated = updateData.timeEstimated;
      }
      await transaction.update(orderRef, updateData as { [x: string]: any });
      if (isStripeProcess) {
        await transaction.set(stripeRef, { paymentIntent }, { merge: true });
        if (stripeReadOnly) {
          await transaction.update(stripeReadOnlyRef, {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        // customer
        const { payment_method } = (paymentIntent as any).latest_charge;
        if (payment_method && order.isSavePay && stripeSystem) {
          const stripe = utils.get_stripe();
          const stripeAccount = await getStripeAccount(db, restaurantOwnerUid);
          await stripe.paymentMethods.attach(
            payment_method,
            {
              customer: stripeSystem.customerId,
            },
            { stripeAccount },
          );
          await transaction.set(stripeSystemRef, {
            customerId: stripeSystem.customerId,
            payment_method,
          });
        }
      }
      return { success: true, order };
    });
    const orderData = result.order;
    const msgKey = getMgsKey(status, orderData.isEC, orderData && orderData.timeEstimated);
    // sendSMS is always true
    if (orderData.sendSMS && msgKey) {
      const params = {};
      if (status === order_status.order_accepted || status === order_status.ready_to_pickup) {
        params["time"] = moment(orderData.timeEstimated.toDate()).tz(utils.timezone).locale("ja").format("LLL");
        console.log("timeEstimated", params["time"]);
      }
      await sendMessageToCustomer(db, msgKey, restaurantData.hasLine, restaurantData.restaurantName, orderData, restaurantId, orderId, params);
    }
    return { result: true };
  } catch (error: any) {
    if (error.type && error.type === "StripeCardError") {
      utils.log_error(error);
      return {
        result: false,
        type: error.type,
      };
    }
    throw utils.process_error(error);
  }
};
