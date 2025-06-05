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

            // 初始化 database 與 auth
            this.database = firebase.database();
            this.auth = firebase.auth();
            cc.log("[FirebaseManager] 成功初始化 Firebase Database 與 Auth");
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

    // 以下是你原本的各種方法，不必修改
    private checkDatabase(): Promise<void> {
        if (!this.database) {
            const error = new Error("Firebase Database not initialized.");
            cc.error("[FirebaseManager] " + error.message);
            return Promise.reject(error);
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
        if (!this.database) {
            cc.error("[FirebaseManager] Database 未初始化，無法監聽玩家資料");
            return;
        }
        this.database.ref(`players/${playerId}`).on(
            "value",
            snapshot => callback(snapshot.val()),
            error => cc.error(`[FirebaseManager] 監聽玩家 ${playerId} 資料時出錯：`, error)
        );
    }

    public async removePlayer(playerId: string): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`players/${playerId}`).remove();
    }

    public async updateGameState(gameId: string, state: any): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`games/${gameId}`).set(state);
    }

    public syncGameState(gameId: string, callback: (state: any) => void): void {
        if (!this.database) {
            cc.error("[FirebaseManager] Database 未初始化，無法同步遊戲狀態");
            return;
        }
        this.database.ref(`games/${gameId}`).on(
            "value",
            snapshot => callback(snapshot.val()),
            error => cc.error(`[FirebaseManager] 同步遊戲 ${gameId} 狀態時出錯：`, error)
        );
    }

    public async createGameSession(gameId: string, hostId: string): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`games/${gameId}`).set({
            hostId: hostId,
            state: "waiting",
            players: {},
            imposter: null,
            startTime: null
        });
    }

    public async joinGameSession(gameId: string, playerId: string): Promise<void> {
        await this.checkDatabase();
        return this.database.ref(`games/${gameId}/players/${playerId}`).set({
            joined: true,
            joinTime: firebase.database.ServerValue.TIMESTAMP
        });
    }

    public async assignImposter(gameId: string): Promise<string> {
        await this.checkDatabase();
        const snapshot = await this.database.ref(`games/${gameId}/players`).once("value");
        const players = snapshot.val();
        if (!players) return null;
        const playerIds = Object.keys(players);
        const impostorId = playerIds[Math.floor(Math.random() * playerIds.length)];
        await this.database.ref(`games/${gameId}`).update({
            imposter: impostorId,
            state: "started",
            startTime: firebase.database.ServerValue.TIMESTAMP
        });
        return impostorId;
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
