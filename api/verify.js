const deviceDB = new Map();
const userDB = new Map();

export default async function handler(req, res) {
  // 1. जर Telegram Bot ने GET रिक्वेस्ट टाकली (/api/verify?userid=123&bot=MyBot)
  if (req.method === 'GET') {
    const { userid, bot } = req.query;
    if (!userid || !bot) {
      return res.status(400).json({ ok: false, message: 'Provide userid and bot in link' });
    }
    const userKey = `${bot.toLowerCase()}_${userid}`;
    const record = userDB.get(userKey);

    if (!record) {
      return res.status(200).json({
        ok: false,
        status: 'pending',
        banned: false,
        bot,
        userid,
        message: 'User has not opened verification website yet ⏳'
      });
    }
    return res.status(200).json(record);
  }

  // 2. जेव्हा युजर Website उघडेल (POST Request)
  if (req.method === 'POST') {
    const { userid, bot, deviceId, previousUser } = req.body;
    const cleanBot = (bot || 'default').toLowerCase();
    const devKey = `${cleanBot}_${deviceId}`;
    const existing = deviceDB.get(devKey);

    // जर त्याच डिव्हाइसवर आणि त्याच बॉटवर दुसरा वेगळा User ID आला -> DIRECT BANNED 🚫
    const firstUser = existing ? existing.first_userid : previousUser;

    if ((previousUser && String(previousUser) !== String(userid)) || 
        (existing && (existing.banned || String(existing.first_userid) !== String(userid)))) {
      
      const banResponse = {
        ok: false,
        code: 403,
        status: 'banned',
        banned: true,
        access: 'DENIED 🚫',
        reason: 'MULTIPLE_ACCOUNTS_SAME_DEVICE',
        bot,
        current_userid: String(userid),
        first_userid: String(firstUser || userid),
        deviceId,
        accounts_count: 2,
        message: 'Direct Banned 🚫! Same device & same bot used with multiple user IDs.'
      };

      deviceDB.set(devKey, banResponse);
      userDB.set(`${cleanBot}_${userid}`, banResponse);
      if (firstUser) userDB.set(`${cleanBot}_${firstUser}`, banResponse);

      return res.status(200).json(banResponse);
    }

    // जर फक्त १ च युजर असेल -> VERIFIED SUCCESSFULLY ✅
    const successResponse = {
      ok: true,
      code: 200,
      status: 'verified',
      banned: false,
      access: 'GRANTED ✅',
      bot,
      userid: String(userid),
      deviceId,
      accounts_count: 1,
      message: 'Verification Successful ✅! Single account verified on this device.'
    };

    deviceDB.set(devKey, { first_userid: String(userid), banned: false });
    userDB.set(`${cleanBot}_${userid}`, successResponse);

    return res.status(200).json(successResponse);
  }
}
