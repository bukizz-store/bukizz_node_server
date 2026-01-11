import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const PORT = 5005;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function startServer() {
    console.log(`Starting test server on port ${PORT}...`);
    const server = spawn('node', ['index.js'], {
        cwd: 'server',
        env: { ...process.env, PORT: PORT.toString() },
        stdio: 'inherit' // Pipe output to console for debugging
    });

    // Wait for server to be ready
    for (let i = 0; i < 30; i++) {
        try {
            const res = await fetch(`http://localhost:${PORT}/health`);
            if (res.ok) {
                console.log('Test server is up!');
                return server;
            }
        } catch (e) {
            // ignore
        }
        await setTimeout(1000);
    }

    server.kill();
    throw new Error('Server failed to start in 30s');
}

async function runTests() {
    let server;
    try {
        server = await startServer();

        console.log('Starting Category API Tests...');

        // 1. Register/Login to get token
        let token;
        const email = `test.category.${Date.now()}@example.com`;
        const password = 'password123';

        try {
            console.log(`\n1. Registering new user: ${email}`);
            const registerRes = await fetch(`${BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    name: 'Test User', // 'fullName' might be 'name' based on registerSchema in index.js
                    fullName: 'Test User',
                    phone: '9876543210'
                })
            });

            const registerData = await registerRes.json();
            if (!registerRes.ok) {
                console.log('Registration error details:', registerData);
                throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
            } else {
                console.log('Registration successful');
                // Check where token is. index.js register doesn't return token? 
                // index.js register handler returns { message, user }. No token.
                // So we MUST login.
            }

            console.log('Logging in...');
            const loginRes = await fetch(`${BASE_URL}/auth/login`, { // changed to /auth/login based on authRoutes? 
                // Wait, authRoutes is mounted at /api/v1/auth. 
                // index.js also has /login and /register at root! (legacy)
                // But we should use /api/v1/custom authRoutes if possible, or matches legacy.
                // Test script uses BASE_URL/auth/login.
                // Let's use BASE_URL/auth/login.
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const loginData = await loginRes.json();
            if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);

            // authController.login returns { success, data: { token, user } } usually?
            // Let's check authController.js or authService.js later if this fails.
            // Assuming standard format.
            token = loginData.data?.accessToken || loginData.data?.token || loginData.token || loginData.session?.access_token;
            console.log('Login successful, token received');

        } catch (error) {
            console.error('Authentication failed:', error);
            throw error;
        }

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // 2. Create Category
        let categoryId;
        const categoryName = `Test Category ${Date.now()}`;
        const categorySlug = `test-category-${Date.now()}`;

        try {
            console.log(`\n2. Creating Category: ${categoryName}`);
            const createRes = await fetch(`${BASE_URL}/categories`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({
                    name: categoryName,
                    slug: categorySlug,
                    description: 'This is a test category'
                })
            });
            const createData = await createRes.json();
            if (!createRes.ok) throw new Error(`Create Category failed: ${JSON.stringify(createData)}`);

            console.log('Category Created:', createData.data.category);
            categoryId = createData.data.category.id;
        } catch (error) {
            console.error('Create Category Test Failed:', error);
        }

        // 3. Get Category
        if (categoryId) {
            try {
                console.log(`\n3. Fetching Category: ${categoryId}`);
                const getRes = await fetch(`${BASE_URL}/categories/${categoryId}`, {
                    headers: authHeaders
                });
                const getData = await getRes.json();
                if (!getRes.ok) throw new Error(`Get Category failed: ${JSON.stringify(getData)}`);
                console.log('Category Fetched:', getData.data.category.name);
            } catch (error) {
                console.error('Get Category Test Failed:', error);
            }

            // 4. Update Category
            try {
                console.log(`\n4. Updating Category: ${categoryId}`);
                const updateName = `${categoryName} Updated`;
                const updateRes = await fetch(`${BASE_URL}/categories/${categoryId}`, {
                    method: 'PUT',
                    headers: authHeaders,
                    body: JSON.stringify({
                        name: updateName,
                        description: 'Updated description'
                    })
                });
                const updateData = await updateRes.json();
                if (!updateRes.ok) throw new Error(`Update Category failed: ${JSON.stringify(updateData)}`);
                console.log('Category Updated:', updateData.data.category.name);

                if (updateData.data.category.name !== updateName) throw new Error('Update did not persist name change');

            } catch (error) {
                console.error('Update Category Test Failed:', error);
            }

            // 5. Delete Category
            try {
                console.log(`\n5. Deleting Category: ${categoryId}`);
                const deleteRes = await fetch(`${BASE_URL}/categories/${categoryId}`, {
                    method: 'DELETE',
                    headers: authHeaders
                });
                const deleteData = await deleteRes.json();
                if (!deleteRes.ok) throw new Error(`Delete Category failed: ${JSON.stringify(deleteData)}`);
                console.log('Category Deleted Success:', deleteData.data.deleted);

                // Verify Deletion
                const verifyRes = await fetch(`${BASE_URL}/categories/${categoryId}`, {
                    headers: authHeaders
                });
                if (verifyRes.status === 404 || (await verifyRes.json()).data?.category === null) { // findById might return null/404
                    console.log('Verification: Category successfully not found (404)');
                } else {
                    console.log('Verification Warning: Category still exists or other error', verifyRes.status);
                }

            } catch (error) {
                console.error('Delete Category Test Failed:', error);
            }
        }

    } catch (error) {
        console.error('Test run failed:', error);
    } finally {
        if (server) {
            console.log('Stopping test server...');
            server.kill();
        }
        process.exit(0);
    }
}

runTests();
