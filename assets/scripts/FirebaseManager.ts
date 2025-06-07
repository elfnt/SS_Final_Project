// FirebaseManager.ts
const { ccclass, property } = cc._decorator;
declare const firebase: any;

@ccclass
export default class FirebaseManager extends cc.Component {
    private static _instance: FirebaseManager = null;
    public database: firebase.database.Database = null;
    public auth: firebase.auth.Auth = null;

    private firebaseConfig = {
        apiKey: "AIzaSyAXdnKMCukYKbwp3-7zfbs7hNMQTYPCCYI",
        authDomain: "ssfp-2.firebaseapp.com",
        databaseURL: "https://ssfp-2-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "ssfp-2",
        storageBucket: "ssfp-2.firebasestorage.app",
        messagingSenderId: "513093603084",
        appId: "1:513093603084:web:6e6b58bac9319c74d6c329",
        measurementId: "G-YKTZ36J51C"
    };

    public static getInstance(): FirebaseManager {
        if (!this._instance) {
            cc.error("FirebaseManager instance not found. Ensure it is in the first scene and its script execution order is high.");
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
                cc.error("[FirebaseManager] Firebase SDK not found.");
                return;
            }
            if (!firebase.apps.length) {
                firebase.initializeApp(this.firebaseConfig);
            } else {
                firebase.app();
            }
            this.database = firebase.database();
            this.auth = firebase.auth();
        } catch (error) {
            cc.error("[FirebaseManager] Initialization error:", error);
        }
    }

    public async assignImposter(gameId: string, hostId: string): Promise<string | null> {
        if (!this.database) return null;
        
        try {
            const playersSnapshot = await this.database.ref('players')
                .orderByChild('online')
                .equalTo(true)
                .once('value');
                
            const playersData = playersSnapshot.val() || {};
            const playerIds = Object.keys(playersData);
            
            const MIN_PLAYERS_TO_START = 4;
            if (playerIds.length < MIN_PLAYERS_TO_START) {
                cc.warn(`[FirebaseManager] Not enough players: ${playerIds.length}`);
                return null;
            }
            
            const activePlayers = {};
            const selectedPlayerIds = playerIds.slice(0, MIN_PLAYERS_TO_START);
            
            for (const id of selectedPlayerIds) {
                activePlayers[id] = { 
                    active: true,
                    name: playersData[id].name || "Unknown" 
                };
            }

            const randomIndex = Math.floor(Math.random() * selectedPlayerIds.length); 
            const imposterId = selectedPlayerIds[randomIndex];
            const imposterPlayer = activePlayers[imposterId];
            const imposterName = (imposterPlayer && imposterPlayer.name) ? imposterPlayer.name : "Unknown";

            const newGameState = {
                hostId: hostId,
                state: "active",
                startTime: firebase.database.ServerValue.TIMESTAMP,
                activePlayers: activePlayers,
                imposter: { id: imposterId, name: imposterName },
                winner: null,
                endTime: null
            };

            await this.database.ref(`games/${gameId}`).set(newGameState);
            cc.log(`[FirebaseManager] New game started. Imposter: ${imposterName} (ID: ${imposterId})`);
            return imposterId;
        } catch (error) {
            cc.error(`[FirebaseManager] Error assigning imposter:`, error);
            return null;
        }
    }
}