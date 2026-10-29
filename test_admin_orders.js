const axios = require('axios');

async function test() {
  try {
    const login = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'ivan.p@example.net',
      password: 'Admin@1234'
    });
    const token = login.data.data.token;
    
    console.log('Login success');
    
    const orders = await axios.get('http://localhost:5000/api/admin/material-orders', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('List Material Orders Success:', orders.data.data.items.length, 'orders found');
    if (orders.data.data.items.length > 0) {
      const id = orders.data.data.items[0].id;
      const detail = await axios.get(`http://localhost:5000/api/admin/material-orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Get Detail Success:', detail.data.data.orderCode);
    }
  } catch (err) {
    console.error('Test Failed:', err.response?.data || err.message);
  }
}

test();
