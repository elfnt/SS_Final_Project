// FirebaseManager.ts
// Attach this script to an empty node in your first scene (e.g., "FirebaseSystem").
// Set its execution order to a high priority (e.g., -100) in Project Settings.

const { ccclass, property } = cc._decorator;

declare const firebase: any; // For Firebase v8 SDK (global 'firebase' object)

@ccclass
export default class FirebaseManager extends cc.Component {
    private static _instance: FirebaseManager = null;
    public database: firebase.database.Database = null;
    public auth: firebase.auth.Auth = null;

    // IMPORTANT: Replace with your actual Firebase project configuration!
    private firebaseConfig = {
  apiKey: "AIzaSyAijSWSyEjHUC95bhCwAGIyKZFIDC69xRQ",
  authDomain: "ssfp-8139e.firebaseapp.com",
  databaseURL: "https://ssfp-8139e-default-rtdb.firebaseio.com",
  projectId: "ssfp-8139e",
  storageBucket: "ssfp-8139e.firebasestorage.app",
  messagingSenderId: "647323954046",
  appId: "1:647323954046:web:7058021c9a4cbd782da12f",
  measurementId: "G-XVETSBJZRP"
    };

    public static getInstance(): FirebaseManager {
        if (!this._instance) {
            cc.error("FirebaseManager instance is not yet available. Ensure its node is in the scene and active, and its script execution order is set high (e.g., -100).");
        }
        return this._instance;
    }

    onLoad() {
        cc.log("FirebaseManager: onLoad started.");
        if (FirebaseManager._instance && FirebaseManager._instance !== this) {
            cc.log("FirebaseManager: Destroying duplicate instance.");
            this.node.destroy();
            return;
        }
        FirebaseManager._instance = this;
        cc.game.addPersistRootNode(this.node);
        cc.log("FirebaseManager: Instance set and node persisted.");

        this.initializeFirebase();
    }

    initializeFirebase() {
        try {
            if (typeof firebase === 'undefined') {
                cc.error("FirebaseManager: Firebase SDK (global 'firebase' object) is not loaded. Ensure it's included in your project (e.g., via index.html for v8).");
                this.enabled = false;
                return;
            }

            cc.log("FirebaseManager: Attempting to initialize Firebase app...");
            if (!firebase.apps.length) { // Check if the default app is already initialized
                firebase.initializeApp(this.firebaseConfig);
                cc.log("FirebaseManager: Firebase app initialized successfully.");
            } else {
                firebase.app(); // Get the default app if already initialized
                cc.log("FirebaseManager: Firebase app already initialized.");
            }

            // Initialize services after app initialization is confirmed
            this.database = firebase.database();
            this.auth = firebase.auth(); // Initialize auth service too if you plan to use it
            cc.log("FirebaseManager: Firebase services (Database, Auth) references obtained.");

        } catch (error) {
            cc.error("FirebaseManager: Error during Firebase initialization:", error);
            if (error.message && error.message.includes("already exists")) {
                 cc.warn("FirebaseManager: Firebase app named '[DEFAULT]' already exists. This is usually fine. Ensuring services are initialized.");
                if (!this.database) this.database = firebase.database();
                if (!this.auth) this.auth = firebase.auth();
            } else {
                this.enabled = false; // Disable this component on other critical errors
            }
        }
    }

    // Your existing methods like savePlayerData, fetchPlayerData, etc.
    // Ensure they check `if (!this.database)` before use.
    public async savePlayerData(playerId: string, data: any): Promise<void> {
        if (!this.database) {
            cc.error("FirebaseManager: Database not initialized. Cannot save player data.");
            return Promise.reject(new Error("Firebase Database not initialized."));
        }
        try {
            await this.database.ref(`players/${playerId}`).set(data);
            // cc.log(`Player data saved for ${playerId}`); // Less verbose
        } catch (error) {
            console.error(`Error saving player data for ${playerId}:`, error);
            throw error;
        }
    }

    public async fetchPlayerData(playerId: string): Promise<any> {
        if (!this.database) {
            cc.error("FirebaseManager: Database not initialized. Cannot fetch player data.");
            return Promise.reject(new Error("Firebase Database not initialized."));
        }
        try {
            const snapshot = await this.database.ref(`players/${playerId}`).once("value");
            if (snapshot.exists()) {
                return snapshot.val();
            } else {
                cc.log(`No data found for player ${playerId}.`);
                return null;
            }
        } catch (error) {
            console.error("Error fetching player data:", error);
            throw error;
        }
    }

    public listenToPlayerData(playerId: string, callback: (data: any) => void): void {
        if (!this.database) {
            cc.error("FirebaseManager: Database not initialized. Cannot listen to player data.");
            return;
        }
        const playerRef = this.database.ref(`players/${playerId}`);
        playerRef.on("value", (snapshot) => {
            callback(snapshot.val());
        }, (error) => {
            cc.error(`FirebaseManager: Error listening to player data for ${playerId}:`, error);
        });
        // To stop listening later, you'd need to store playerRef and call playerRef.off("value", callback);
    }

    public async removePlayer(playerId: string): Promise<void> {
        if (!this.database) {
            cc.error("FirebaseManager: Database not initialized. Cannot remove player.");
            return Promise.reject(new Error("Firebase Database not initialized."));
        }
        try {
            await this.database.ref(`players/${playerId}`).remove();
            cc.log(`Player ${playerId} removed from the database.`);
        } catch (error) {
            console.error("Error removing player:", error);
            throw error;
        }
    }

    public syncGameState(gameId: string, callback: (state: any) => void): void {
        if (!this.database) {
            cc.error("FirebaseManager: Database not initialized. Cannot sync game state.");
            return;
        }
        this.database.ref(`games/${gameId}`).on("value", (snapshot) => {
            callback(snapshot.val());
        }, (error) => {
            cc.error(`FirebaseManager: Error syncing game state for ${gameId}:`, error);
        });
    }

    public async updateGameState(gameId: string, state: any): Promise<void> {
        if (!this.database) {
            cc.error("FirebaseManager: Database not initialized. Cannot update game state.");
            return Promise.reject(new Error("Firebase Database not initialized."));
        }
        try {
            await this.database.ref(`games/${gameId}`).set(state);
        } catch (error) {
            console.error("Error updating game state:", error);
            throw error;
        }
    }
}