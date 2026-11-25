/**
 * ==========================================
 * File: src/firebase/errorHandler.ts
 * Project: AdBoard V3
 * Purpose:
 * Central error interceptor that serialises
 * Permission or write errors into strict JSON formats.
 * ==========================================
 */

import { auth } from './config';
import { OperationType, FirestoreErrorInfo } from '../types';

/**
 * Parses and serialises a Firestore permission error into structured JSON messages.
 *
 * Purpose:
 * Converts permission errors on reads/writes into diagnostic details
 * about active credentials, path targeted, and event operation triggers.
 *
 * Parameters:
 * @param {unknown} error - Caught runtime exception
 * @param {OperationType} operationType - Core operation class (create, update, delete, etc.)
 * @param {string | null} path - Target collection or document path
 *
 * Returns:
 * @throws {Error} Throws a formatted Error with JSON diagnostic metadata
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    operationType,
    path,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
  };

  console.error('Firestore Hardened Diagnostics Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
