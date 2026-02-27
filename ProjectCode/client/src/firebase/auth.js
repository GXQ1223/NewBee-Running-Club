import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    FacebookAuthProvider,
    updateProfile,
    sendPasswordResetEmail,
    signOut
  } from 'firebase/auth';
  import { auth } from './config';
  import { syncFirebaseUser } from '../api/members';

  /**
   * Sync Firebase user to MySQL members table and check status
   * @param {Object} user - Firebase user object
   * @returns {Object} - { member, error } - member data or error if pending/blocked
   */
  const syncUserToDatabase = async (user) => {
    try {
      const member = await syncFirebaseUser({
        firebase_uid: user.uid,
        email: user.email,
        display_name: user.displayName,
        photo_url: user.photoURL
      });

      // Check if member is pending approval
      if (member.status === 'pending') {
        // Sign them out
        await signOut(auth);
        return {
          member: null,
          error: 'Your account is pending approval. Please wait for the committee to review your application. / 您的账户正在等待审核，请等待管理员审批。'
        };
      }

      // Check if member quit
      if (member.status === 'quit') {
        await signOut(auth);
        return {
          member: null,
          error: 'Your account has been deactivated. Please contact the committee. / 您的账户已停用，请联系管理员。'
        };
      }

      return { member, error: null };
    } catch (error) {
      console.error('Failed to sync user to database:', error);
      // Don't throw - auth succeeded, just logging the sync failure
      return { member: null, error: null };
    }
  };
  
  // Standard email/password sign in
  export const loginWithEmailAndPassword = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Sync user to MySQL database and check status
      const { error: statusError } = await syncUserToDatabase(userCredential.user);
      if (statusError) {
        return { user: null, error: statusError };
      }
      return { user: userCredential.user, error: null };
    } catch (error) {
      return { user: null, error: error.message };
    }
  };
  
  // Register with email/password
  export const registerWithEmailAndPassword = async (email, password, displayName) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // Update profile with display name if provided
      if (displayName) {
        await updateProfile(userCredential.user, { displayName });
      }

      // Sync user to MySQL database and check status
      const { error: statusError } = await syncUserToDatabase({
        ...userCredential.user,
        displayName: displayName || userCredential.user.displayName
      });

      // For new registrations, they will be pending - sign them out and show message
      if (statusError) {
        return { user: null, error: statusError };
      }

      return { user: userCredential.user, error: null };
    } catch (error) {
      return { user: null, error: error.message };
    }
  };
  
  // Google sign in
  export const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      // Sync user to MySQL database and check status
      const { error: statusError } = await syncUserToDatabase(userCredential.user);
      if (statusError) {
        return { user: null, error: statusError };
      }
      return { user: userCredential.user, error: null };
    } catch (error) {
      return { user: null, error: error.message };
    }
  };
  
  // Facebook sign in
  export const signInWithFacebook = async () => {
    try {
      const provider = new FacebookAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      // Sync user to MySQL database and check status
      const { error: statusError } = await syncUserToDatabase(userCredential.user);
      if (statusError) {
        return { user: null, error: statusError };
      }
      return { user: userCredential.user, error: null };
    } catch (error) {
      return { user: null, error: error.message };
    }
  };
  
  // Password reset
  export const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };
  
  // Sign out
  export const logout = async () => {
    try {
      await signOut(auth);
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };