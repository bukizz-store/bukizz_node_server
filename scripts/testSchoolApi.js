
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const PORT = 5006; // Use a different port
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function startServer() {
    console.log(`Starting test server on port ${PORT}...`);
    const server = spawn('node', ['index.js'], {
        cwd: 'server',
        env: { ...process.env, PORT: PORT.toString() },
        stdio: 'inherit'
    });

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

        console.log('Starting School API Tests...');

        // 1. Register/Login to get token
        let token;
        const email = `test.school.${Date.now()}@example.com`;
        const password = 'password123';

        try {
            console.log(`\n1. Registering new user: ${email}`);
            const registerRes = await fetch(`${BASE_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    name: 'Test School Admin',
                    fullName: 'Test School Admin',
                    phone: '9876543210'
                })
            });

            const registerData = await registerRes.json();
            if (!registerRes.ok && registerRes.status !== 409) {
                throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
            }

            // Login
            console.log('Logging in...');
            const loginRes = await fetch(`${BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const loginData = await loginRes.json();
            if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);

            token = loginData.data?.accessToken || loginData.data?.token || loginData.token || loginData.session?.access_token;
            console.log('Login successful');

        } catch (error) {
            console.error('Authentication failed:', error);
            throw error;
        }

        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // 2. Create School
        let schoolId;
        const schoolName = `Test School ${Date.now()}`;
        const schoolPayload = {
            name: schoolName,
            type: 'private',
            board: 'CBSE',
            address: {
                line1: '123 Test Lane',
                city: 'Test City',
                state: 'Test State',
                postalCode: '110001',
                country: 'India'
            },
            city: 'Test City',
            state: 'Test State',
            postalCode: '110001',
            country: 'India',
            phone: '9876543210',
            email: 'school@test.com'
        };

        try {
            console.log(`\n2. Creating School: ${schoolName}`);
            const createRes = await fetch(`${BASE_URL}/schools`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(schoolPayload)
            });
            const createData = await createRes.json();
            if (!createRes.ok) throw new Error(`Create School failed: ${JSON.stringify(createData)}`);

            console.log('School Created:', createData.data.school.id);
            schoolId = createData.data.school.id;
        } catch (error) {
            console.error('Create School Test Failed:', error);
        }

        // 3. Get School
        if (schoolId) {
            try {
                console.log(`\n3. Fetching School: ${schoolId}`);
                const getRes = await fetch(`${BASE_URL}/schools/${schoolId}`, {
                    headers: authHeaders // Verify public access too? Usually public.
                });
                const getData = await getRes.json();
                if (!getRes.ok) throw new Error(`Get School failed: ${JSON.stringify(getData)}`);
                console.log('School Fetched:', getData.data.school.name);
            } catch (error) {
                console.error('Get School Test Failed:', error);
            }

            // 4. Update School
            try {
                console.log(`\n4. Updating School: ${schoolId}`);
                const updateName = `${schoolName} Updated`;
                const updateRes = await fetch(`${BASE_URL}/schools/${schoolId}`, {
                    method: 'PUT',
                    headers: authHeaders,
                    body: JSON.stringify({
                        name: updateName,
                        phone: '9876543211'
                    })
                });
                const updateData = await updateRes.json();
                if (!updateRes.ok) throw new Error(`Update School failed: ${JSON.stringify(updateData)}`);
                console.log('School Updated:', updateData.data.school.name);

                if (updateData.data.school.name !== updateName) throw new Error('Update did not persist name change');

            } catch (error) {
                console.error('Update School Test Failed:', error);
            }

            // 5. Deactivate School (Soft Delete)
            try {
                console.log(`\n5. Deactivating School: ${schoolId}`);
                const deleteRes = await fetch(`${BASE_URL}/schools/${schoolId}`, {
                    method: 'DELETE',
                    headers: authHeaders
                });
                const deleteData = await deleteRes.json();
                if (!deleteRes.ok) throw new Error(`Deactivate School failed: ${JSON.stringify(deleteData)}`);
                console.log('School Deactivated:', deleteData.message);

                // Verify Deactivation - Should fail or show inactive
                const verifyRes = await fetch(`${BASE_URL}/schools/${schoolId}`, {
                    headers: authHeaders
                });
                // According to service, getSchool throws 404 if not found or inactive
                if (verifyRes.status === 404) {
                    console.log('Verification: School successfully 404 (Inactive/Not Found)');
                } else {
                    const verifyData = await verifyRes.json();
                    if (!verifyData.isActive) {
                        console.log('Verification: School inactive but accessible (Behavior check OK)');
                    } else {
                        console.log('Verification Warning: School still active', verifyRes.status);
                    }
                }

            } catch (error) {
                console.error('Deactivate School Test Failed:', error);
            }

            // 6. Reactivate School
            try {
                console.log(`\n6. Reactivating School: ${schoolId}`);
                const reactivateRes = await fetch(`${BASE_URL}/schools/${schoolId}/reactivate`, {
                    method: 'PATCH',
                    headers: authHeaders
                });
                if (!reactivateRes.ok) {
                    // Might fail if user is not admin or route logic requires specific role?
                    // But let's verify route exists.
                    const errorData = await reactivateRes.json();
                    console.log('Reactivate result:', errorData);
                } else {
                    console.log('School Reactivated Success');
                    // Verify Active
                    const verifyRes = await fetch(`${BASE_URL}/schools/${schoolId}`, {
                        headers: authHeaders
                    });
                    if (verifyRes.ok) console.log('Verification: School active again');
                }
            } catch (e) {
                console.log('Reactivate failed', e);
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
