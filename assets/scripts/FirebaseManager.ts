// FirebaseManager.ts (Updated)
const { ccclass, property } = cc._decorator;
declare const firebase: any; // 使用 Firebase v8 SDK（global 'firebase' 物件）

@ccclass
export default class FirebaseManager extends cc.Component {
    private static _instance: FirebaseManager = null;
    public database: firebase.database.Database = null;
    public auth: firebase.auth.Auth = null;

    // Firebase 配置（保持你原本的值）
    private firebaseConfig = {
        apiKey: "AIzaSyAijSWSyEjHUC95bhCwAGIyKZFIDC69xRQ",
        authDomain: "ssfp-8139e.firebaseapp.com",
        databaseURL: "https://ssfp-8139e-default-rtdb.firebaseio.com",
        projectId: "ssfp-8139e",
        storageBucket: "ssfp-8139e.appspot.com",
        messagingSenderId: "647323954046",
        appId: "1:647323954046:web:7058021c9a4cbd782da12f",
        measurementId: "G-XVETSBJZRP"
    };

    /**
     * 最小改動：如果場景裡還找不到 _instance，就「動態建立一個 Node 並掛上這個 Component」。
     * 這麼做能保證任何時候呼叫 getInstance() 都能拿到有效的 .database。
     */
    public static getInstance(): FirebaseManager {
        if (!this._instance) {
            // 場景裡尚未有 FirebaseManager 的實例，於是自動建立一個 Node
            const node = new cc.Node("FirebaseManager-AutoCreated");
            const mgr = node.addComponent(FirebaseManager);
            cc.game.addPersistRootNode(node);

            // 馬上呼叫一次 initializeFirebase，避免 onLoad() 還沒跑到就被呼叫
            mgr.initializeFirebase();

            FirebaseManager._instance = mgr;
            cc.warn("[FirebaseManager] 自動建立並初始化一個全域實例");
        }
        return this._instance;
    }

    /**
     * onLoad 階段，如果場景裡已經掛過一個實例，就把自己 destroy；
     * 否則就把自己設為單例，並保證 node 永遠不會隨場景切換被銷毀。
     */
    onLoad() {
        if (FirebaseManager._instance && FirebaseManager._instance !== this) {
            // 如果已有別的 instance，就把重複的這個刪掉
            this.node.destroy();
            return;
        }

        // 設定成目前的 _instance，並標記此 node 為可跨 Scene 保留
        FirebaseManager._instance = this;
        cc.game.addPersistRootNode(this.node);

        // 正式初始化 Firebase（只有第一次會真正跑到）
        this.initializeFirebase();
    }

    private initializeFirebase() {
        try {
            if (typeof firebase === 'undefined') {
                cc.error("[FirebaseManager] 無法找到 Firebase SDK，請確認已正確載入");
                this.enabled = false;
                return;
            }

            // 如果尚未 initializeApp，就初始化；否則用已存在的
            if (!firebase.apps.length) {
                firebase.initializeApp(this.firebaseConfig);
            } else {
                firebase.app();
            }
            this.database = firebase.database();
            this.auth = firebase.auth();
            cc.log("[FirebaseManager] Firebase initialized successfully.");
        } catch (error) {
            cc.error("[FirebaseManager] 初始化 Firebase 發生錯誤：", error);
            // 如果是 already exists 錯誤，就嘗試取用現有的 database/auth
            if (error.message?.includes("already exists")) {
                if (!this.database) this.database = firebase.database();
                if (!this.auth) this.auth = firebase.auth();
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
