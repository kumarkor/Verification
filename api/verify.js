import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCewAWzj09CsJWJRqZ16TmWN6Z-d0ATyaM",
  authDomain: "kumar-loot.firebaseapp.com",
  databaseURL: "https://kumar-loot-default-rtdb.firebaseio.com",
  projectId: "kumar-loot",
  storageBucket: "kumar-loot.firebasestorage.app",
  messagingSenderId: "264932703737",
  appId: "1:264932703737:web:2cc50a8bbe1923917b5128"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default async function handler(req, res) {
  // 1. Telegram Bot कडून GET Request आली तर स्टेटस चेक करणे
  if (req.method === 'GET') {
    const { userid, bot } = req.query;
    if (!userid || !bot) {
      return res.status(400).json({ ok: false, message: 'Provide userid and bot' });
    }

    try {
      const cleanBot = bot.toLowerCase().replace('@', '');
      const userRef = ref(db, `verification/${cleanBot}/users/${userid}`);
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        return res.status(200).json({
          ok: false,
          status: 'pending',
          banned: false,
          bot: cleanBot,
          userid,
          message: 'User has not completed device verification yet ⏳'
        });
      }

      return res.status(200).json(snapshot.val());
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  // 2. युजरने वेबसाइट उघडल्यावर POST Request द्वारे Firebase तपणे
  if (req.method === 'POST') {
    const { userid, bot, deviceId } = req.body;

    if (!userid || !bot || !deviceId) {
      return res.status(400).json({ status: 'error', message: 'Missing parameters' });
    }

    try {
      const cleanBot = bot.toLowerCase().replace('@', '');
      const deviceRef = ref(db, `verification/${cleanBot}/devices/${deviceId}`);
      const deviceSnap = await get(deviceRef);

      let responseData;

      if (deviceSnap.exists()) {
        const deviceData = deviceSnap.val();

        // जर त्याच डिव्हाइसवर आधीच दुसरा User ID रजिस्टर असेल तर -> DIRECT BANNED 🚫
        if (String(deviceData.first_userid) !== String(userid) || deviceData.banned) {
          responseData = {
            ok: false,
            code: 403,
            status: 'banned',
            banned: true,
            access: 'DENIED 🚫',
            reason: 'MULTIPLE_ACCOUNTS_SAME_DEVICE',
            bot: cleanBot,
            current_userid: String(userid),
            first_userid: String(deviceData.first_userid),
            deviceId,
            message: 'Direct Banned 🚫! Multiple Telegram accounts used on the same device.'
          };

          // Firebase मध्ये डिव्हाइस आणि युजर दोघांना Banned मार्क करणे
          await set(deviceRef, { first_userid: deviceData.first_userid, second_userid: String(userid), banned: true });
          await set(ref(db, `verification/${cleanBot}/users/${userid}`), responseData);

          return res.status(200).json(responseData);
        }

        // जर तोच जुना युजर परत आला तर Verified ✅
        responseData = {
          ok: true,
          code: 200,
          status: 'verified',
          banned: false,
          access: 'GRANTED ✅',
          bot: cleanBot,
          userid: String(userid),
          deviceId,
          message: 'Verification Successful ✅! Device already registered to this user.'
        };

        await set(ref(db, `verification/${cleanBot}/users/${userid}`), responseData);
        return res.status(200).json(responseData);
      }

      // जर हा डिव्हाइसवर पहिलाच युजर असेल तर -> SUCCESSFUL ✅
      responseData = {
        ok: true,
        code: 200,
        status: 'verified',
        banned: false,
        access: 'GRANTED ✅',
        bot: cleanBot,
        userid: String(userid),
        deviceId,
        message: 'Verification Successful ✅! First account locked to this device.'
      };

      // Firebase मध्ये सेव्ह करणे
      await set(deviceRef, { first_userid: String(userid), banned: false });
      await set(ref(db, `verification/${cleanBot}/users/${userid}`), responseData);

      return res.status(200).json(responseData);

    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
