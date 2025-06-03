// FirebaseManager.ts - Streamlined version with game session support
const { ccclass, property } = cc._decorator;

declare const firebase: any; // For Firebase v8 SDK (global 'firebase' object)

@ccclass
export default class FirebaseManager extends cc.Component {
    private static _instance: FirebaseManager = null;
    public database: firebase.database.Database = null;
    public auth: firebase.auth.Auth = null;

    // Firebase configuration
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
            cc.error("FirebaseManager instance not available. Ensure it's in the scene with high execution priority.");
        }
        return this._instance;
    }

    onLoad() {
        // Handle singleton pattern
        if (FirebaseManager._instance && FirebaseManager._instance !== this) {
            this.node.destroy();
            return;
        }
        
        FirebaseManager._instance = this;
        cc.game.addPersistRootNode(this.node);
        
        this.initializeFirebase();
    }

    private initializeFirebase() {
        try {
            if (typeof firebase === 'undefined') {
                cc.error("Firebase SDK not loaded. Check your project setup.");
                this.enabled = false;
                return;
            }

            // Initialize Firebase app if not already initialized
            if (!firebase.apps.length) {
                firebase.initializeApp(this.firebaseConfig);
            } else {
                firebase.app();
            }

            // Initialize services
            this.database = firebase.database();
            this.auth = firebase.auth();

        } catch (error) {
            cc.error("Firebase initialization error:", error);
            if (error.message?.includes("already exists")) {
                if (!this.database) this.database = firebase.database();
                if (!this.auth) this.auth = firebase.auth();
            } else {
                this.enabled = false;
            }
        }
    }

    // Check if database is initialized and return a rejection if not
    private checkDatabase(): Promise<void> {
        if (!this.database) {
            const error = new Error("Firebase Database not initialized.");
            cc.error("FirebaseManager: " + error.message);
            return Promise.reject(error);
        }
        return Promise.resolve();
    }

    // Player data management
    public async savePlayerData(playerId: string, data: any): Promise<void> {
        await this.checkDatabase();
        try {
            return this.database.ref(`players/${playerId}`).set(data);
        } catch (error) {
            console.error(`Error saving player data for ${playerId}:`, error);
            throw error;
        }
    }

    public async fetchPlayerData(playerId: string): Promise<any> {
        await this.checkDatabase();
        try {
            const snapshot = await this.database.ref(`players/${playerId}`).once("value");
            return snapshot.exists() ? snapshot.val() : null;
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
        
        this.database.ref(`players/${playerId}`).on("value", 
            snapshot => callback(snapshot.val()),
            error => cc.error(`Error listening to player data for ${playerId}:`, error)
        );
    }

    public async removePlayer(playerId: string): Promise<void> {
        await this.checkDatabase();
        try {
            return this.database.ref(`players/${playerId}`).remove();
        } catch (error) {
            console.error("Error removing player:", error);
            throw error;
        }
    }

    // Game state management
    public syncGameState(gameId: string, callback: (state: any) => void): void {
        if (!this.database) {
            cc.error("FirebaseManager: Database not initialized. Cannot sync game state.");
            return;
        }
        
        this.database.ref(`games/${gameId}`).on("value", 
            snapshot => callback(snapshot.val()),
            error => cc.error(`Error syncing game state for ${gameId}:`, error)
        );
    }

    public async updateGameState(gameId: string, state: any): Promise<void> {
        await this.checkDatabase();
        try {
            return this.database.ref(`games/${gameId}`).set(state);
        } catch (error) {
            console.error("Error updating game state:", error);
            throw error;
        }
    }

    // New methods for game session management
    public async createGameSession(gameId: string, hostId: string): Promise<void> {
        await this.checkDatabase();
        try {
            return this.database.ref(`games/${gameId}`).set({
                hostId: hostId,
                state: "waiting",
                players: {},
                imposter: null,
                startTime: null
            });
        } catch (error) {
            console.error("Error creating game session:", error);
            throw error;
        }
    }

    public async joinGameSession(gameId: string, playerId: string): Promise<void> {
        await this.checkDatabase();
        try {
            return this.database.ref(`games/${gameId}/players/${playerId}`).set({
                joined: true,
                joinTime: firebase.database.ServerValue.TIMESTAMP
            });
        } catch (error) {
            console.error("Error joining game session:", error);
            throw error;
        }
    }

    public async assignImposter(gameId: string): Promise<string> {
        await this.checkDatabase();
        try {
            // Get all players in this game
            const snapshot = await this.database.ref(`games/${gameId}/players`).once("value");
            const players = snapshot.val();
            if (!players) return null;
            
            // Convert to array and pick random player
            const playerIds = Object.keys(players);
            const randomIndex = Math.floor(Math.random() * playerIds.length);
            const imposerId = playerIds[randomIndex];
            
            // Update the game with the imposter
            await this.database.ref(`games/${gameId}`).update({
                imposter: imposerId,
                state: "started",
                startTime: firebase.database.ServerValue.TIMESTAMP
            });
            
            return imposerId;
        } catch (error) {
            console.error("Error assigning imposter:", error);
            throw error;
        }
    }

    public async endGameSession(gameId: string, winnerType: string): Promise<void> {
        await this.checkDatabase();
        try {
            return this.database.ref(`games/${gameId}`).update({
                state: "ended",
                endTime: firebase.database.ServerValue.TIMESTAMP,
                winner: winnerType // "imposter" or "crew"
            });
        } catch (error) {
            console.error("Error ending game session:", error);
            throw error;
        }
    }
}