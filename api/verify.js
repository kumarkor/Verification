// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCewAWzj09CsJWJRqZ16TmWN6Z-d0ATyaM",
  authDomain: "kumar-loot.firebaseapp.com",
  databaseURL: "https://kumar-loot-default-rtdb.firebaseio.com",
  projectId: "kumar-loot",
  storageBucket: "kumar-loot.firebasestorage.app",
  messagingSenderId: "264932703737",
  appId: "1:264932703737:web:2cc50a8bbe1923917b5128"
};

// Backup Memory (जर Firebase चे Rules लॉक असतील तरीही API क्रॅश होणार नाही)
const memoryDevices = new Map();
const memoryUsers = new Map();

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const DB_URL = firebaseConfig.databaseURL;

  // ==========================================================
  // 1. GET Request: जेव्हा बॉट किंवा ब्राउझर /api/verify चेक करेल
  // ==========================================================
  if (req.method === "GET") {
    const query = req.query || {};
    const userid = query.userid;
    const bot = (query.bot || "kumarmakerbot").toLowerCase().replace("@", "");

    // जर लिंकमध्ये userid नसेल तर दोन्ही Sample Responses (Verified & Banned) दाखवा
    if (!userid) {
      return res.status(200).json({
        ok: true,
        firebase_project: firebaseConfig.projectId,
        usage: "https://verification-sigma-flax.vercel.app/api/verify?userid=7335163273&bot=kumarmakerbot",
        verified_sample: {
          ok: true,
          code: 200,
          status: "verified",
          banned: false,
          access: "GRANTED ✅",
          bot: "kumarmakerbot",
          userid: "7335163273",
          deviceId: "DEV-7F9A21C4",
          accounts_count: 1,
          message: "Verification Successful ✅! First account locked to this device."
        },
        banned_sample: {
          ok: false,
          code: 403,
          status: "banned",
          banned: true,
          access: "DENIED 🚫",
          reason: "MULTIPLE_ACCOUNTS_SAME_DEVICE",
          bot: "kumarmakerbot",
          current_userid: "9988776655",
          first_userid: "7335163273",
          deviceId: "DEV-7F9A21C4",
          accounts_count: 2,
          message: "Direct Banned 🚫! Same device & same bot used with multiple user IDs."
        }
      });
    }

    try {
      let userData = null;
      try {
        const fbRes = await fetch(`${DB_URL}/verification/${bot}/users/${userid}.json`);
        const fbJson = await fbRes.json();
        if (fbJson && !fbJson.error) {
          userData = fbJson;
        }
      } catch (e) {
        // Fallback to memory
      }

      if (!userData) {
        userData = memoryUsers.get(`${bot}_${userid}`);
      }

      if (!userData) {
        return res.status(200).json({
          ok: false,
          code: 404,
          status: "pending",
          banned: false,
          bot: bot,
          userid: String(userid),
          message: "User has not completed device verification yet ⏳",
          verify_link: `https://verification-sigma-flax.vercel.app/?userid=${userid}&bot=${bot}`
        });
      }

      return res.status(200).json(userData);
    } catch (err) {
      return res.status(200).json({
        ok: false,
        status: "error",
        message: err.message
      });
    }
  }

  // ==========================================================
  // 2. POST Request: जेव्हा युजर व्हेरिफिकेशन पेज उघडेल
  // ==========================================================
  if (req.method === "POST") {
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const userid = body.userid;
    const bot = (body.bot || "kumarmakerbot").toLowerCase().replace("@", "");
    const deviceId = body.deviceId;
    const previousUser = body.previousUser;

    if (!userid || !deviceId) {
      return res.status(400).json({
        ok: false,
        status: "error",
        message: "Missing userid or deviceId"
      });
    }

    try {
      const devKey = `${bot}_${deviceId}`;
      const deviceUrl = `${DB_URL}/verification/${bot}/devices/${deviceId}.json`;
      const userUrl = `${DB_URL}/verification/${bot}/users/${userid}.json`;

      let deviceData = null;
      try {
        const devRes = await fetch(deviceUrl);
        const devJson = await devRes.json();
        if (devJson && !devJson.error) {
          deviceData = devJson;
        }
      } catch (e) {
        // Fallback to memory if Firebase fails
      }

      if (!deviceData) {
        deviceData = memoryDevices.get(devKey);
      }

      const existingFirstUser = deviceData ? deviceData.first_userid : previousUser;

      // जर एकाच Device वर आणि एकाच Bot वर दुसरा वेगळा User आला -> DIRECT BANNED 🚫
      const isMultiAccount =
        (previousUser && String(previousUser) !== String(userid)) ||
        (deviceData && (deviceData.banned || String(deviceData.first_userid) !== String(userid)));

      if (isMultiAccount) {
        const banResponse = {
          ok: false,
          code: 403,
          status: "banned",
          banned: true,
          access: "DENIED 🚫",
          reason: "MULTIPLE_ACCOUNTS_SAME_DEVICE",
          bot: bot,
          current_userid: String(userid),
          first_userid: String(existingFirstUser || userid),
          deviceId: String(deviceId),
          accounts_count: 2,
          message: "Direct Banned 🚫! Same device & same bot used with multiple user IDs."
        };

        memoryDevices.set(devKey, {
          first_userid: String(existingFirstUser || userid),
          second_userid: String(userid),
          banned: true
        });
        memoryUsers.set(`${bot}_${userid}`, banResponse);
        if (existingFirstUser) {
          memoryUsers.set(`${bot}_${existingFirstUser}`, banResponse);
        }

        // Save to Firebase Realtime Database
        try {
          await fetch(deviceUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              first_userid: String(existingFirstUser || userid),
              second_userid: String(userid),
              banned: true,
              updatedAt: new Date().toISOString()
            })
          });
          await fetch(userUrl, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(banResponse)
          });
          if (existingFirstUser) {
            await fetch(`${DB_URL}/verification/${bot}/users/${existingFirstUser}.json`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(banResponse)
            });
          }
        } catch (e) {}

        return res.status(200).json(banResponse);
      }

      // जर पहिलाच युजर असेल किंवा तोच युजर परत आला असेल -> VERIFIED SUCCESSFULLY ✅
      const successResponse = {
        ok: true,
        code: 200,
        status: "verified",
        banned: false,
        access: "GRANTED ✅",
        bot: bot,
        userid: String(userid),
        deviceId: String(deviceId),
        accounts_count: 1,
        message: "Verification Successful ✅! Single account verified on this device."
      };

      memoryDevices.set(devKey, { first_userid: String(userid), banned: false });
      memoryUsers.set(`${bot}_${userid}`, successResponse);

      try {
        await fetch(deviceUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_userid: String(userid),
            banned: false,
            updatedAt: new Date().toISOString()
          })
        });
        await fetch(userUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(successResponse)
        });
      } catch (e) {}

      return res.status(200).json(successResponse);
    } catch (err) {
      return res.status(200).json({
        ok: false,
        status: "error",
        message: err.message
      });
    }
  }

  return res.status(405).json({ ok: false, message: "Method Not Allowed" });
};
