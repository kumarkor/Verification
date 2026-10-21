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

export default async function handler(req, res) {
  // CORS Headers जेणेकरून कुठूनही रिक्वेस्ट ब्लॉक होणार नाही
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const DB_URL = firebaseConfig.databaseURL;

  // ==========================================================
  // 1. GET Request: Telegram Bot ने किंवा युजरने API चेक केल्यास
  // ==========================================================
  if (req.method === 'GET') {
    const { userid, bot } = req.query;

    // जर कोणी फक्त /api/verify ओपन केली तर दोन्ही Sample Responses दाखवा
    if (!userid) {
      return res.status(200).json({
        ok: true,
        firebase_project: firebaseConfig.projectId,
        api_endpoint: "https://verification-sigma-flax.vercel.app/api/verify?userid=7335163273&bot=kumarmakerbot",
        when_verified_response: {
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
        when_banned_response: {
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
      const cleanBot = (bot || 'kumarmakerbot').toLowerCase().replace('@', '');
      const response = await fetch(`${DB_URL}/verification/${cleanBot}/users/${userid}.json`);
      const userData = await response.json();

      if (!userData) {
        return res.status(200).json({
          ok: false,
          code: 404,
          status: 'pending',
          banned: false,
          bot: cleanBot,
          userid: String(userid),
          message: 'User has not completed device verification yet ⏳'
        });
      }

      return res.status(200).json(userData);
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  // ==========================================================
  // 2. POST Request: युजरने लिंक उघडल्यावर Device + Bot + User चेक करणे
  // ==========================================================
  if (req.method === 'POST') {
    const { userid, bot, deviceId, previousUser } = req.body || {};

    if (!userid || !deviceId) {
      return res.status(400).json({ ok: false, status: 'error', message: 'Missing userid or deviceId' });
    }

    try {
      const cleanBot = (bot || 'kumarmakerbot').toLowerCase().replace('@', '');
      const deviceUrl = `${DB_URL}/verification/${cleanBot}/devices/${deviceId}.json`;
      const userUrl = `${DB_URL}/verification/${cleanBot}/users/${userid}.json`;

      const deviceRes = await fetch(deviceUrl);
      const deviceData = await deviceRes.json();

      // चेक १: आधीचा युजर आणि आत्ताचा युजर वेगळा आहे का? (Same Device + Same Bot + 2 Users = DIRECT BAN 🚫)
      const existingFirstUser = deviceData ? deviceData.first_userid : previousUser;
      const isMultiAccount = 
        (previousUser && String(previousUser) !== String(userid)) ||
        (deviceData && (deviceData.banned || String(deviceData.first_userid) !== String(userid)));

      if (isMultiAccount) {
        const banResponse = {
          ok: false,
          code: 403,
          status: 'banned',
          banned: true,
          access: 'DENIED 🚫',
          reason: 'MULTIPLE_ACCOUNTS_SAME_DEVICE',
          bot: cleanBot,
          current_userid: String(userid),
          first_userid: String(existingFirstUser || userid),
          deviceId: String(deviceId),
          accounts_count: 2,
          message: 'Direct Banned 🚫! Same device & same bot used with multiple user IDs.'
        };

        // Firebase मध्ये डिव्हाइस आणि दोन्ही युजर Banned म्हणून सेव्ह करणे
        await fetch(deviceUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_userid: String(existingFirstUser || userid),
            second_userid: String(userid),
            banned: true,
            updatedAt: new Date().toISOString()
          })
        });

        await fetch(userUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(banResponse)
        });

        if (existingFirstUser) {
          await fetch(`${DB_URL}/verification/${cleanBot}/users/${existingFirstUser}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(banResponse)
          });
        }

        return res.status(200).json(banResponse);
      }

      // चेक २: पहिलाच युजर आहे किंवा तोच युजर पुन्हा आला आहे -> VERIFIED SUCCESSFULLY ✅
      const successResponse = {
        ok: true,
        code: 200,
        status: 'verified',
        banned: false,
        access: 'GRANTED ✅',
        bot: cleanBot,
        userid: String(userid),
        deviceId: String(deviceId),
        accounts_count: 1,
        message: 'Verification Successful ✅! Single account verified on this device.'
      };

      await fetch(deviceUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_userid: String(userid),
          banned: false,
          updatedAt: new Date().toISOString()
        })
      });

      await fetch(userUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(successResponse)
      });

      return res.status(200).json(successResponse);

    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
