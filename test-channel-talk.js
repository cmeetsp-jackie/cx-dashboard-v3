
require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

async function testChannelTalk() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const url = `https://api.channel.io/open/v5/statistics/users?since=${today}`;
    const res = await axios.get(url, { 
      headers: { 
        'x-access-key': process.env.CHANNELTALK_ACCESS_KEY, 
        'x-access-secret': process.env.CHANNELTALK_ACCESS_SECRET 
      } 
    });
    if (res.data.users) {
        console.log('✅ ChannelTalk OK');
    } else {
        console.log('❌ ChannelTalk FAILED: Unexpected response', res.data);
    }
  } catch(err) {
    const errorMsg = err.response ? (err.response.data.errors ? err.response.data.errors[0].message : err.response.statusText) : err.message;
    console.log('❌ ChannelTalk FAILED: ' + errorMsg);
  }
}
testChannelTalk();
