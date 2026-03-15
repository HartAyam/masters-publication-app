import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const databaseId = process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || '(default)';

console.log(`[Server] Initializing Firebase Admin:
  Project ID: ${projectId || 'auto-detect'}
  Database ID: ${databaseId}
`);

try {
  if (admin.apps.length === 0) {
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccountKey) {
      console.log("[Server] Initializing with Service Account Key");
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
        projectId: projectId,
      });
    } else if (projectId) {
      console.log(`[Server] Initializing with Project ID: ${projectId}`);
      admin.initializeApp({
        projectId: projectId,
      });
    } else {
      console.log("[Server] Initializing with Application Default Credentials (Auto-detect)");
      admin.initializeApp();
    }
    console.log("Firebase Admin initialized successfully");
  }
} catch (error) {
  console.error("Firebase Admin initialization failed:", error);
}

const db = getFirestore(admin.apps.length > 0 ? admin.app() : undefined as any, databaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Diagnostic endpoint to check Firebase Admin permissions
  app.get("/api/admin/check-permissions", async (req, res) => {
    const { adminToken } = req.query;

    if (!adminToken) {
      return res.status(400).json({ error: "Missing adminToken" });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(adminToken as string);
      
      const diagnostics = {
        projectId: admin.app().options.projectId || "auto-detected",
        authStatus: "OK",
        firestoreStatus: "Pending",
        authUpdateStatus: "Pending",
        error: null as any
      };

      try {
        await db.collection("users").limit(1).get();
        diagnostics.firestoreStatus = "OK";
      } catch (e: any) {
        diagnostics.firestoreStatus = `Error: ${e.message}`;
        diagnostics.error = e;
      }

      try {
        await admin.auth().listUsers(1);
        diagnostics.authUpdateStatus = "OK";
      } catch (e: any) {
        diagnostics.authUpdateStatus = `Error: ${e.message}`;
        if (!diagnostics.error) diagnostics.error = e;
      }

      res.json(diagnostics);
    } catch (error: any) {
      res.status(401).json({ error: "Invalid token", details: error.message });
    }
  });

  // API Route to change user password (Admin only)
  app.post("/api/admin/change-password", async (req, res) => {
    const { uid, newPassword, adminToken } = req.body;

    if (!uid || !newPassword || !adminToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Verify the admin token
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      
      // Check if the user is actually an admin in Firestore
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.role !== "Admin") {
        return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
      }

      // Update the user's password
      await admin.auth().updateUser(uid, {
        password: newPassword,
      });

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Error updating password:", error);
      // Provide more context if it's a permission error
      if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
        return res.status(500).json({ 
          error: "Permission Denied: The server's service account does not have sufficient permissions to access Firestore or Auth. Please ensure the Firebase Admin SDK is correctly configured and the service account has the 'Cloud Datastore User' and 'Firebase Authentication Admin' roles.",
          details: error.message
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // API Route to update user email (Admin only)
  app.post("/api/admin/update-user", async (req, res) => {
    const { uid, email, adminToken } = req.body;

    if (!uid || !email || !adminToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.role !== "Admin") {
        return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
      }

      // Update the user's email in Auth
      await admin.auth().updateUser(uid, {
        email: email,
      });

      res.json({ message: "User updated successfully in Auth" });
    } catch (error: any) {
      console.error("Error updating user in Auth:", error);
      if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
        return res.status(500).json({ 
          error: "Permission Denied: The server's service account does not have sufficient permissions to access Firestore or Auth.",
          details: error.message
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // API Route to delete user from Auth (Admin only)
  app.post("/api/admin/delete-user", async (req, res) => {
    const { uid, adminToken } = req.body;

    if (!uid || !adminToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.role !== "Admin") {
        return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
      }

      // Delete the user from Auth
      await admin.auth().deleteUser(uid);

      res.json({ message: "User deleted successfully from Auth" });
    } catch (error: any) {
      console.error("Error deleting user from Auth:", error);
      if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
        return res.status(500).json({ 
          error: "Permission Denied: The server's service account does not have sufficient permissions to access Firestore or Auth.",
          details: error.message
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // API Route to create user in Auth (Admin only)
  app.post("/api/admin/create-user", async (req, res) => {
    const { email, password, role, branchId, customId, adminToken } = req.body;

    if (!email || !password || !role || !branchId || !customId || !adminToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (!userData || userData.role !== "Admin") {
        return res.status(403).json({ error: "Unauthorized. Admin privileges required." });
      }

      // 1. Create user in Auth
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: email.split('@')[0],
      });

      // 2. Create user profile in Firestore
      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        customId,
        email,
        role,
        branchId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ message: "User created successfully", uid: userRecord.uid });
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
        return res.status(500).json({ 
          error: "Permission Denied: The server's service account does not have sufficient permissions to access Firestore or Auth.",
          details: error.message
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
