// Unified Firebase wrapper re-exporting the single initialized Firebase app, Firestore, Auth, and Storage instances.
export {
  app,
  db,
  auth,
  storage,
  firebaseMetadata,
  ADMIN_BOOTSTRAP_EMAIL,
  ADMIN_BOOTSTRAP_EMAILS,
  OperationType,
  handleFirestoreError,
  testFirestoreConnection,
} from '../services/firebase';
