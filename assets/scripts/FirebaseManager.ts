// FirebaseManager.ts
const { ccclass, property } = cc._decorator;

declare const firebase: any; // For Firebase v8 SDK (global 'firebase' object)

@ccclass
export default class FirebaseManager extends cc.Component {
    private static _instance: FirebaseManager = null;
    public database: firebase.database.Database = null;
    public auth: firebase.auth.Auth = null;

    // Firebase configuration (ensure this is correct)
    private firebaseConfig = {
        apiKey: "AIzaSyAijSWSyEjHUC95bhCwAGIyKZFIDC69xRQ",
        authDomain: "ssfp-8139e.firebaseapp.com",
        databaseURL: "https://ssfp-8139e-default-rtdb.firebaseio.com",
        projectId: "ssfp-8139e",
        storageBucket: "ssfp-8139e.firebasestorage.app",
        messagingSenderId: "647323954046",
        appId: "1:647323954046:web:7058021c9a4cbd782da12f",
        measurementId: "G-XVETSBJZRP"
    }; //

    public static getInstance(): FirebaseManager {
        if (!this._instance) {
            cc.error("FirebaseManager instance not available. Ensure it's in the scene with high execution priority.");
        }
        return this._instance;
    }

    onLoad() {
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
            if (!firebase.apps.length) {
                firebase.initializeApp(this.firebaseConfig); //
            } else {
                firebase.app();
            }
            this.database = firebase.database(); //
            this.auth = firebase.auth(); //
            cc.log("[FirebaseManager] Firebase initialized successfully.");
        } catch (error) {
            cc.error("Firebase initialization error:", error);
            if (error.message?.includes("already exists")) {
                if (!this.database) this.database = firebase.database();
                if (!this.auth) this.auth = firebase.auth();
                 cc.log("[FirebaseManager] Firebase app already existed, services re-acquired.");
            } else {
                this.enabled = false;
            }
        }
    }

    private async checkDatabase(): Promise<void> { // Note: Changed to async and returns Promise
        if (!this.database) {
            const errorMsg = "Firebase Database not initialized.";
            cc.error("FirebaseManager: " + errorMsg);
            // Attempt re-initialization or fail gracefully
            this.initializeFirebase(); // Attempt to re-initialize
            if (!this.database) { // Check again after attempt
                 return Promise.reject(new Error(errorMsg));
            }
        }
        return Promise.resolve();
    }

    public async savePlayerData(playerId: string, data: any): Promise<void> { //
        await this.checkDatabase(); //
        return this.database.ref(`players/${playerId}`).set(data); //
    }

    public async fetchPlayerData(playerId: string): Promise<any> { //
        await this.checkDatabase(); //
        const snapshot = await this.database.ref(`players/${playerId}`).once("value"); //
        return snapshot.exists() ? snapshot.val() : null; //
    }

    public listenToPlayerData(playerId: string, callback: (data: any) => void): void { //
        this.checkDatabase().then(() => {
            this.database.ref(`players/${playerId}`).on("value", 
                snapshot => callback(snapshot.val()),
                error => cc.error(`Error listening to player data for ${playerId}:`, error)
            ); //
        }).catch(err => cc.error("Cannot listenToPlayerData, DB not ready:", err));
    }

    public async removePlayer(playerId: string): Promise<void> { //
        await this.checkDatabase(); //
        return this.database.ref(`players/${playerId}`).remove(); //
    }

    public syncGameState(gameId: string, callback: (state: any) => void): void { //
         this.checkDatabase().then(() => {
            this.database.ref(`games/${gameId}`).on("value", 
                snapshot => callback(snapshot.val()),
                error => cc.error(`Error syncing game state for ${gameId}:`, error)
            ); //
        }).catch(err => cc.error("Cannot syncGameState, DB not ready:", err));
    }

    public async updateGameState(gameId: string, state: any): Promise<void> { //
        await this.checkDatabase(); //
        return this.database.ref(`games/${gameId}`).update(state); // Use update instead of set if you want to merge
    }

public async createGameSession(gameId: string, hostId: string): Promise<void> {
    await this.checkDatabase();
    const gameSessionRef = this.database.ref(`games/${gameId}`);
    const snapshot = await gameSessionRef.once('value');
    if (!snapshot.exists()) {
        cc.log(`[FirebaseManager] Creating new game session: ${gameId}`);
        return gameSessionRef.set({
            hostId: hostId,
            state: "waiting",
            // Remove this line: players: {},
            imposter: null,
            startTime: null
        });
    } else {
        cc.log(`[FirebaseManager] Game session ${gameId} already exists.`);
        return Promise.resolve();
    }
}


public async assignImposter(gameId: string): Promise<string | null> {
    try {
        await this.checkDatabase();
        
        // First, get all online players from the /players path
        const playersSnapshot = await this.database.ref('players')
            .orderByChild('online')
            .equalTo(true)
            .once('value');
            
        const players = playersSnapshot.val() || {};
        const playerIds = Object.keys(players);
        
        //cc.log(`[FirebaseManager] Found ${playerIds.length} online players`);
        
        const MIN_PLAYERS_TO_START = 4;
        if (playerIds.length < MIN_PLAYERS_TO_START) {
            cc.warn(`[FirebaseManager] Not enough online players: ${playerIds.length}`);
            return null;
        }
        
// Create activePlayers object with the first 4 players
const activePlayers = {};
const playerSlice = playerIds.slice(0, 4);
for (let i = 0; i < playerSlice.length; i++) {
    const id = playerSlice[i];
    const name = players[id].name || "Unknown";
    activePlayers[id] = { 
        active: true,
        name: name 
    };
}
        // Pick a random imposter from the 4 selected players
        const randomIndex = Math.floor(Math.random() * 4); 
        const imposterId = playerSlice[randomIndex];
        const imposterName = activePlayers[imposterId]?.name || "Unknown";

        // Update game state, store both imposter id and name
        await this.database.ref(`games/${gameId}`).update({
            imposter: {
            id: imposterId,
            name: imposterName
            },
            state: "active",
            startTime: firebase.database.ServerValue.TIMESTAMP,
            activePlayers: activePlayers
        });

        cc.log(`[FirebaseManager] Imposter assigned: ${imposterId} (${imposterName}) for game ${gameId}. State set to active.`);
        return imposterId;
    } catch (error) {
        cc.error(`[FirebaseManager] Error assigning imposter:`, error);
        return null;
    }
}

    public async endGameSession(gameId: string, winnerType: string): Promise<void> { //
        await this.checkDatabase(); //
        return this.database.ref(`games/${gameId}`).update({ //
            state: "ended", //
            endTime: firebase.database.ServerValue.TIMESTAMP, //
            winner: winnerType // "imposter" or "crew" //
        });
    }
}