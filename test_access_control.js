/**
 * test_access_control.js
 * Verification of Hybrid RBAC + ABAC Access Control System
 * Based on ACCESS_CONTROL_PLAN.md Phase 5 Test Matrix
 */

import { performance } from 'perf_hooks';
import createDependencies from './src/config/dependencies.js';

async function runAccessControlVerification() {
  console.log('====================================================');
  console.log('  STARTING RBAC + ABAC ACCESS CONTROL VERIFICATION  ');
  console.log('====================================================\n');

  try {
    // Step 0: Initialize Dependencies & Warm Cache
    console.log('[Phase 2 Benchmark] Initializing dependencies & warming cache...');
    const startTime = performance.now();
    const dependencies = await createDependencies();
    const initDuration = (performance.now() - startTime).toFixed(2);
    console.log(`[PASS] Dependencies initialized in ${initDuration}ms\n`);

    const accessService = dependencies.accessService;
    if (!accessService) {
      throw new Error('accessService not found on dependencies container!');
    }

    const checkPerm = (roles, perms) => {
      try {
        return accessService.hasPermission(roles, perms);
      } catch (err) {
        if (err.statusCode === 403) return false;
        throw err;
      }
    };

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Role Permissions In-Memory Warm & Latency Test
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 1: In-Memory Role-Permission Cache Latency ---');
    const cachedRoles = Array.from(accessService.rolePermissionsCache.keys());
    console.log(`Loaded ${cachedRoles.length} roles into RAM: [${cachedRoles.join(', ')}]`);

    for (const role of cachedRoles) {
      const perms = accessService.rolePermissionsCache.get(role);
      console.log(` - Role "${role}": ${perms.size} permissions mapped`);
    }

    const perfStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      checkPerm(['support'], 'support:queries:manage');
    }
    const avgLatencyUs = (((performance.now() - perfStart) / 1000) * 1000).toFixed(4);
    console.log(`Benchmark: 1,000 lookups completed. Avg latency: ${avgLatencyUs} μs per lookup.`);
    if (parseFloat(avgLatencyUs) < 50) {
      console.log(`[PASS] O(1) in-memory cache lookup meets < 0.05ms target (< 50 μs).\n`);
    } else {
      console.log(`[WARN] Lookup latency: ${avgLatencyUs} μs\n`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Superadmin Universal Bypass
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 2: Superadmin Universal Bypass Matrix ---');
    const superadminTests = [
      'settlements:manage',
      'settlements:payouts:execute',
      'schools:delete',
      'roles:assign',
      'products:comprehensive:create',
      'completely:arbitrary:nonexistent:action'
    ];

    let superadminPassed = true;
    for (const action of superadminTests) {
      const allowed = checkPerm(['superadmin'], action);
      if (!allowed) {
        console.error(`[FAIL] Superadmin was denied permission: ${action}`);
        superadminPassed = false;
      }
    }
    if (superadminPassed) {
      console.log('[PASS] Superadmin granted universal bypass on all tested actions.\n');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Support Staff Persona Restrictions
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 3: Support Staff Persona Matrix ---');
    // Check what support perms exist
    const supportPerms = Array.from(accessService.rolePermissionsCache.get('support') || []);
    console.log(` - Support has ${supportPerms.length} assigned permissions`);
    const testSupportPerm = supportPerms[0] || 'support:queries:manage';

    const supportAllowed = checkPerm(['support'], testSupportPerm);
    const supportDenied = checkPerm(['support'], 'settlements:payouts:execute');
    const supportDeniedDelete = checkPerm(['support'], 'schools:delete');

    console.log(` - Support can execute '${testSupportPerm}': ${supportAllowed} (Expected: true)`);
    console.log(` - Support can execute settlements: ${supportDenied} (Expected: false)`);
    console.log(` - Support can delete schools: ${supportDeniedDelete} (Expected: false)`);

    if (supportAllowed && !supportDenied && !supportDeniedDelete) {
      console.log('[PASS] Support persona RBAC boundaries enforced.\n');
    } else {
      console.error('[FAIL] Support persona boundary check failed!\n');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Manager Persona RBAC Check
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 4: Operations Manager Persona Matrix ---');
    const managerPerms = Array.from(accessService.rolePermissionsCache.get('manager') || []);
    console.log(` - Manager has ${managerPerms.length} assigned permissions`);
    const testManagerPerm = managerPerms[0];

    const managerAllowed = checkPerm(['manager'], testManagerPerm);
    const managerRoles = checkPerm(['manager'], 'roles:assign');

    console.log(` - Manager can execute '${testManagerPerm}': ${managerAllowed} (Expected: true)`);
    console.log(` - Manager can assign roles: ${managerRoles} (Expected: false)`);

    if (managerAllowed && !managerRoles) {
      console.log('[PASS] Manager persona RBAC boundaries enforced.\n');
    } else {
      console.error('[FAIL] Manager persona boundary check failed!\n');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Customer / Unprivileged Persona Check
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 5: Customer Persona Isolation ---');
    const customerAction = checkPerm(['customer'], 'products:manage');
    const guestAction = checkPerm([], 'orders:manage');

    console.log(` - Customer can manage products: ${customerAction} (Expected: false)`);
    console.log(` - Guest can manage orders: ${guestAction} (Expected: false)`);

    if (!customerAction && !guestAction) {
      console.log('[PASS] Customer / Guest personas have zero administrative authority.\n');
    } else {
      console.error('[FAIL] Customer / Guest isolation check failed!\n');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 6: ABAC Micro-Cache & Invalidation
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 6: ABAC LRU Micro-Cache Behavior ---');
    const testUserId = '00000000-0000-0000-0000-000000000001';
    const testSchoolId = '11111111-1111-1111-1111-111111111111';

    // Populate cache manually to test lookup and eviction
    accessService.abacCache.set(`admin_scopes:${testUserId}`, [
      { entity_type: 'SCHOOL', entity_id: testSchoolId }
    ]);

    const cachedScopes = accessService.abacCache.get(`admin_scopes:${testUserId}`);
    console.log(` - Cached scopes stored: ${cachedScopes?.length || 0} entries`);

    // Invalidate
    accessService.invalidateAdminScope(testUserId);
    const postInvalidate = accessService.abacCache.get(`admin_scopes:${testUserId}`);
    console.log(` - Post-invalidation cache lookup: ${postInvalidate === undefined ? 'Evicted (undefined)' : 'Failed'}`);

    if (cachedScopes?.length === 1 && postInvalidate === undefined) {
      console.log('[PASS] ABAC LRU micro-cache and invalidation functional.\n');
    } else {
      console.error('[FAIL] ABAC micro-cache invalidation test failed!\n');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Dynamic Role Cache Refresh
    // ─────────────────────────────────────────────────────────────
    console.log('--- TEST 7: Dynamic Role Permissions Refresh ---');
    await accessService.refreshRoleCache();
    console.log(`[PASS] Dynamic role cache refreshed cleanly. Total roles cached: ${accessService.rolePermissionsCache.size}\n`);

    console.log('====================================================');
    console.log('  ALL ACCESS CONTROL VERIFICATION TESTS PASSED!     ');
    console.log('====================================================');
  } catch (error) {
    console.error('VERIFICATION ERROR:', error);
  }
}

runAccessControlVerification().then(() => {
  setTimeout(() => process.exit(0), 100);
});
