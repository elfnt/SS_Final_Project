// FirebaseManager.ts (Updated)
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
    };

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
                firebase.initializeApp(this.firebaseConfig);
            } else {
                firebase.app();
            }
            this.database = firebase.database();
            this.auth = firebase.auth();
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

    private async checkDatabase(): Promise<void> {
        if (!this.database) {
            const errorMsg = "Firebase Database not initialized.";
            cc.error("FirebaseManager: " + errorMsg);
            this.initializeFirebase(); // Attempt to re-initialize
            if (!this.database) {
                 return Promise.reject(new Error(errorMsg));
            }
        }
        return Promise.resolve();
    }

    public async savePlayerData(playerId: string, data: any): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`players/${playerId}`).set(data);
    }

    public async fetchPlayerData(playerId: string): Promise<any> {
        await this.checkDatabase();
        const snapshot = await this.database.ref(`players/${playerId}`).once("value");
        return snapshot.exists() ? snapshot.val() : null;
    }

    public listenToPlayerData(playerId: string, callback: (data: any) => void): void {
        this.checkDatabase().then(() => {
            this.database.ref(`players/${playerId}`).on("value", 
                snapshot => callback(snapshot.val()),
                error => cc.error(`Error listening to player data for ${playerId}:`, error)
            );
        }).catch(err => cc.error("Cannot listenToPlayerData, DB not ready:", err));
    }

    public async removePlayer(playerId: string): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`players/${playerId}`).remove();
    }

    public syncGameState(gameId: string, callback: (state: any) => void): void {
         this.checkDatabase().then(() => {
            this.database.ref(`games/${gameId}`).on("value", 
                snapshot => callback(snapshot.val()),
                error => cc.error(`Error syncing game state for ${gameId}:`, error)
            );
        }).catch(err => cc.error("Cannot syncGameState, DB not ready:", err));
    }

    public async updateGameState(gameId: string, state: any): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`games/${gameId}`).update(state);
    }

    /**
     * Creates a new game session, assigns an imposter, and sets the game state to active.
     * This is the single, authoritative function for starting a game.
     * @param gameId The ID of the game to create/start.
     * @param hostId The ID of the player who initiated the game start.
     * @returns The ID of the assigned imposter, or null if the game couldn't be started.
     */
    public async assignImposter(gameId: string, hostId: string): Promise<string | null> {
        try {
            await this.checkDatabase();
            
            const playersSnapshot = await this.database.ref('players')
                .orderByChild('online')
                .equalTo(true)
                .once('value');
                
            const playersData = playersSnapshot.val() || {};
            const playerIds = Object.keys(playersData);
            
            const MIN_PLAYERS_TO_START = 4;
            if (playerIds.length < MIN_PLAYERS_TO_START) {
                cc.warn(`[FirebaseManager] Not enough online players to start: ${playerIds.length}`);
                return null;
            }
            
            // Select the first 4 players and create the activePlayers object
            const activePlayers = {};
            const selectedPlayerIds = playerIds.slice(0, MIN_PLAYERS_TO_START);
            
            for (const id of selectedPlayerIds) {
                activePlayers[id] = { 
                    active: true,
                    name: playersData[id].name || "Unknown" 
                };
            }

            // Pick a random imposter from the selected players
            const randomIndex = Math.floor(Math.random() * selectedPlayerIds.length); 
            const imposterId = selectedPlayerIds[randomIndex];
            const imposterName = activePlayers[imposterId]?.name || "Unknown";

            // Define the entire new game state object.
            const newGameState = {
                hostId: hostId,
                state: "active",
                startTime: firebase.database.ServerValue.TIMESTAMP,
                activePlayers: activePlayers,
                imposter: {
                    id: imposterId,
                    name: imposterName
                },
                winner: null, // Ensure winner from previous game is cleared
                endTime: null   // Ensure endTime from previous game is cleared
            };

            // Use 'set' to create a clean game state, overwriting any old session data.
            await this.database.ref(`games/${gameId}`).set(newGameState);

            cc.log(`[FirebaseManager] New game started. Imposter: ${imposterId} (${imposterName}). State set to active.`);
            return imposterId;
        } catch (error) {
            cc.error(`[FirebaseManager] Error assigning imposter:`, error);
            return null;
        }
    }

    public async endGameSession(gameId: string, winnerType: string): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`games/${gameId}`).update({
            state: "ended",
            endTime: firebase.database.ServerValue.TIMESTAMP,
            winner: winnerType
        });
    }
}