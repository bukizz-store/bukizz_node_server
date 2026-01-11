
import 'dotenv/config';
import { getSupabase } from '../src/db/index.js';

const BASE_URL = 'http://localhost:5001/api/v1';
let userToken = '';
let adminToken = '';
let userId = '';
let testProduct = null;
let createdOrderId = '';

// Test Data
const customerUser = {
    fullName: 'Test Customer',
    email: `customer_${Date.now()}@test.com`,
    password: 'Password123!',
    role: 'customer'
};

const address = {
    line1: '123 Test St',
    city: 'Test City',
    state: 'Test State',
    postalCode: '123456',
    country: 'India',
    recipientName: 'Test Recipient',
    phone: '9876543210'
};

async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (options.body && typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
        const error = new Error(`Request failed: ${res.status} ${res.statusText}`);
        error.response = { status: res.status, data };
        throw error;
    }
    return { data, status: res.status };
}

async function loginUser(email, password) {
    try {
        const res = await request('/auth/login', {
            method: 'POST',
            body: { email, password }
        });
        return res.data.data.accessToken;
    } catch (error) {
        console.error('Login failed:', error.response?.data || error.message);
        throw error;
    }
}

async function registerUser(user) {
    try {
        const res = await request('/auth/register', {
            method: 'POST',
            body: user
        });
        return res.data.data;
    } catch (error) {
        if (error.response?.status === 409) {
            console.log('User already exists, logging in...');
            return null;
        }
        console.error('Registration failed:', error.response?.data || error.message);
        throw error;
    }
}

async function authenticate() {
    console.log('\n--- Authenticating ---');

    const registered = await registerUser(customerUser);
    if (registered) {
        userId = registered.user.id;
        userToken = registered.accessToken;
    } else {
        userToken = await loginUser(customerUser.email, customerUser.password);
        // Decode token or fetch profile if userId needed, but let's assume register gave it or next step works
    }
    console.log('Customer authenticated.');

    // Check if we have userId (if logged in separately, we might need to fetch profile)
    if (!userId) {
        // Fetch profile
        const profile = await request('/users/profile', {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        userId = profile.data.data.user.id;
    }

    // Promote to admin
    if (userId) {
        const supabase = getSupabase();
        await supabase.from('users').update({ role: 'admin' }).eq('id', userId);
        console.log('Promoted user to admin for testing purposes.');
        // Login again to get token with updated role
        console.log('Refreshing token...');
        adminToken = await loginUser(customerUser.email, customerUser.password);
        console.log('Admin token refreshed.');
    }
}

async function setupProduct() {
    console.log('\n--- Setting up Product ---');
    try {
        const res = await request('/products?limit=1');
        if (res.data.data.products && res.data.data.products.length > 0) {
            testProduct = res.data.data.products[0];
            console.log(`Using existing product: ${testProduct.title} (${testProduct.id})`);
        } else {
            console.log('No products found. Creating one...');
            const productRes = await request('/products', {
                method: 'POST',
                headers: { Authorization: `Bearer ${adminToken}` },
                body: {
                    title: 'Test Product',
                    description: 'This is a test product',
                    basePrice: 100,
                    sku: `TEST-${Date.now()}`,
                    stock: 100,
                    isActive: true
                }
            });
            testProduct = productRes.data.data.product;
            console.log(`Created product: ${testProduct.title}`);
        }

        // Check/Create Variant
        if (testProduct.variants && testProduct.variants.length > 0) {
            testProduct.variantId = testProduct.variants[0].id;
            console.log('Using existing variant:', testProduct.variantId);
        } else {
            console.log('Creating variant for product...');
            try {
                const variantRes = await request(`/products/${testProduct.id}/variants`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${adminToken}` },
                    body: {
                        productId: testProduct.id,
                        price: 100,
                        stock: 50,
                        sku: `VAR-${Date.now()}`
                    }
                });
                testProduct.variantId = variantRes.data.data.variant.id;
                console.log('Created variant:', testProduct.variantId);
            } catch (err) {
                console.error('Failed to create variant:', err.message);
                if (err.response) console.error('Response:', JSON.stringify(err.response.data));
            }
        }
    } catch (error) {
        console.error('Product setup failed:', error.response?.data || error.message);
        throw error;
    }
}

async function testCreateOrder() {
    console.log('\n--- Testing Create Order ---');
    try {
        const orderData = {
            items: [
                {
                    productId: testProduct.id,
                    variantId: testProduct.variantId || null,
                    quantity: 1,
                    unitPrice: testProduct.basePrice || 100
                }
            ],
            shippingAddress: address,
            billingAddress: address,
            paymentMethod: 'cod',
            contactPhone: '9876543210',
            contactEmail: customerUser.email
        };

        const res = await request('/orders', {
            method: 'POST',
            headers: { Authorization: `Bearer ${userToken}` },
            body: orderData
        });

        console.log('Order Created:', res.data.success);
        createdOrderId = res.data.data.order.id;
        console.log('Order ID:', createdOrderId);
    } catch (error) {
        console.error('Create Order failed:', error.response?.data || error.message);
        throw error;
    }
}

async function testGetOrder() {
    console.log('\n--- Testing Get Order by ID ---');
    try {
        const res = await request(`/orders/${createdOrderId}`, {
            headers: { Authorization: `Bearer ${userToken}` }
        });
        console.log('Get Order Success:', res.data.data.id === createdOrderId);
        console.log('Order Status:', res.data.data.status);
    } catch (error) {
        console.error('Get Order failed:', error.response?.data || error.message);
    }
}

async function testAdminSearch() {
    console.log('\n--- Testing Admin Search ---');
    try {
        const res = await request(`/orders/admin/search?searchTerm=Test`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log('Search Success:', res.data.success);
        console.log('Orders Found:', res.data.data.orders.length);
    } catch (error) {
        console.error('Admin Search failed:', error.response?.data || error.message);
    }
}

async function testUpdateStatus() {
    console.log('\n--- Testing Update Status ---');
    try {
        const res = await request(`/orders/${createdOrderId}/status`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${adminToken}` },
            body: { status: 'processed', note: 'Moving to processed' }
        });
        console.log('Update Status Success:', res.data.success);
        console.log('New Status:', res.data.data.order.status);
    } catch (error) {
        console.error('Update Status failed:', error.response?.data || error.message);
    }
}

async function runTests() {
    try {
        await authenticate();
        await setupProduct();
        await testCreateOrder();
        await testGetOrder();
        await testAdminSearch();
        await testUpdateStatus();
        process.exit(0);
    } catch (error) {
        console.error('Tests failed');
        process.exit(1);
    }
}

runTests();
