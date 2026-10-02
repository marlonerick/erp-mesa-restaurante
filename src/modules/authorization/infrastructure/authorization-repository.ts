import { and, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { elevatedGrant, role, rolePermission, userRoleAssignment } from '@/shared/db/schema';
import { isPermission, newId, type Permission } from '@/shared/kernel';
import type { AuthorizationRepository, RoleDefinition } from '../application/ports';

function groupPermissions<T extends { permissionCode: string | null }>(
  rows: readonly T[],
  keyOf: (row: T) => string,
): Map<string, { first: T; permissions: Permission[] }> {
  const groups = new Map<string, { first: T; permissions: Permission[] }>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? { first: row, permissions: [] };
    if (row.permissionCode !== null && isPermission(row.permissionCode)) {
      group.permissions.push(row.permissionCode);
    }
    groups.set(key, group);
  }
  return groups;
}

export const authorizationRepository: AuthorizationRepository = {
  async findRolesByCodes(tx, codes) {
    if (codes.length === 0) return [];
    const rows = await tx
      .select({ id: role.id, code: role.code, permissionCode: rolePermission.permissionCode })
      .from(role)
      .leftJoin(rolePermission, eq(rolePermission.roleId, role.id))
      .where(inArray(role.code, [...codes]));
    return [...groupPermissions(rows, (row) => row.code).values()].map(
      ({ first, permissions }): RoleDefinition => ({ id: first.id, code: first.code, permissions }),
    );
  },

  async listUserGrants(tx, userId) {
    const rows = await tx
      .select({
        assignmentId: userRoleAssignment.id,
        roleCode: role.code,
        maxDiscountBp: role.maxDiscountBp,
        scopeType: userRoleAssignment.scopeType,
        scopeId: userRoleAssignment.scopeId,
        permissionCode: rolePermission.permissionCode,
      })
      .from(userRoleAssignment)
      .innerJoin(role, eq(role.id, userRoleAssignment.roleId))
      .leftJoin(rolePermission, eq(rolePermission.roleId, role.id))
      .where(eq(userRoleAssignment.userId, userId));
    return [...groupPermissions(rows, (row) => row.assignmentId).values()].map(
      ({ first, permissions }) => ({
        roleCode: first.roleCode,
        maxDiscountBp: first.maxDiscountBp,
        scopeType: first.scopeType,
        scopeId: first.scopeId,
        permissions,
      }),
    );
  },

  listAssignmentsCovering(tx, scope) {
    return tx
      .select({
        userId: userRoleAssignment.userId,
        roleCode: role.code,
        scopeType: userRoleAssignment.scopeType,
      })
      .from(userRoleAssignment)
      .innerJoin(role, eq(role.id, userRoleAssignment.roleId))
      .where(
        or(
          and(
            eq(userRoleAssignment.scopeType, 'STORE'),
            eq(userRoleAssignment.scopeId, scope.storeId),
          ),
          and(
            eq(userRoleAssignment.scopeType, 'COMPANY'),
            eq(userRoleAssignment.scopeId, scope.companyId),
          ),
          and(
            eq(userRoleAssignment.scopeType, 'ORGANIZATION'),
            eq(userRoleAssignment.scopeId, scope.organizationId),
          ),
        ),
      );
  },

  async listStoreRoleCodes(tx, userId, storeId) {
    const rows = await tx
      .select({ code: role.code })
      .from(userRoleAssignment)
      .innerJoin(role, eq(role.id, userRoleAssignment.roleId))
      .where(
        and(
          eq(userRoleAssignment.userId, userId),
          eq(userRoleAssignment.scopeType, 'STORE'),
          eq(userRoleAssignment.scopeId, storeId),
        ),
      );
    return rows.map((row) => row.code);
  },

  async insertAssignment(tx, input) {
    await tx.insert(userRoleAssignment).values({ id: newId(), ...input });
  },

  async deleteStoreAssignment(tx, { userId, roleId, storeId }) {
    await tx
      .delete(userRoleAssignment)
      .where(
        and(
          eq(userRoleAssignment.userId, userId),
          eq(userRoleAssignment.roleId, roleId),
          eq(userRoleAssignment.scopeType, 'STORE'),
          eq(userRoleAssignment.scopeId, storeId),
        ),
      );
  },

  async insertElevatedGrant(tx, grant) {
    await tx.insert(elevatedGrant).values({
      id: newId(),
      tokenHash: grant.tokenHash,
      storeId: grant.storeId,
      permissionCode: grant.permission,
      requesterUserId: grant.requesterUserId,
      requesterSessionId: grant.requesterSessionId,
      authorizerUserId: grant.authorizerUserId,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
    });
  },

  async purgeElevatedGrants(tx, before) {
    const [result] = await tx.delete(elevatedGrant).where(lt(elevatedGrant.createdAt, before));
    return result.affectedRows;
  },

  async consumeElevatedGrant(tx, { tokenHash, sessionId, storeId, permission, now }) {
    const valid = and(
      eq(elevatedGrant.tokenHash, tokenHash),
      eq(elevatedGrant.requesterSessionId, sessionId),
      eq(elevatedGrant.storeId, storeId),
      eq(elevatedGrant.permissionCode, permission),
      isNull(elevatedGrant.usedAt),
      gt(elevatedGrant.expiresAt, now),
    );
    // UPDATE condicional: só uma requisição consegue marcar como usada (uso único mesmo em paralelo)
    const [result] = await tx.update(elevatedGrant).set({ usedAt: now }).where(valid);
    if (result.affectedRows !== 1) {
      return null;
    }
    const [row] = await tx
      .select({ authorizerUserId: elevatedGrant.authorizerUserId })
      .from(elevatedGrant)
      .where(eq(elevatedGrant.tokenHash, tokenHash));
    return row?.authorizerUserId ?? null;
  },
};
