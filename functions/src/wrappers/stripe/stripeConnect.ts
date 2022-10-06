import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

import { connect }  from "../../functions/stripe/oauthConnect";
import { allowInvalidAppCheckToken } from "../firebase";

const db = admin.firestore();

export default functions
  .runWith({
    memory: "1GB" as "1GB",
    maxInstances: 10,
    allowInvalidAppCheckToken,
  })
  .https.onCall(async (data, context) => {
    if (context.app == undefined) {
      throw new functions.https.HttpsError("failed-precondition", "The function must be called from an App Check verified app.");
    }
    return await connect(db, data, context);
  });
