const { ccclass, property } = cc._decorator;

@ccclass
export default class GameManager extends cc.Component {

    @property(cc.Node)
    egg: cc.Node = null;
    @property(cc.Node)
    player: cc.Node = null;
    private eggScript: any = null;
    private playerScript: any = null;

    @property({ type: cc.Label })
    timerLabel: cc.Label = null;

    @property
    totalTime: number = 300; // 倒數總秒數

    private currentTime: number = 0;
    private isGameRunning: boolean = true;

    @property(cc.Node) pauseOverlay: cc.Node = null;
    private isGamePaused: boolean = false;

    onLoad() {
        const physicsMgr = cc.director.getPhysicsManager();
        physicsMgr.enabled = true;
        physicsMgr.debugDrawFlags =
            cc.PhysicsManager.DrawBits.e_aabbBit |
            cc.PhysicsManager.DrawBits.e_jointBit |
            cc.PhysicsManager.DrawBits.e_shapeBit;
        //physicsMgr.debugDrawFlags = 0;
    }

    start() {
        if (this.egg) this.eggScript = this.egg.getComponent("Egg");
        if (this.player) this.playerScript = this.player.getComponent("Player");

        this.currentTime = this.totalTime;
        this.updateTimerLabel();
    }

    update(dt: number) {
        if (!this.isGameRunning || this.isGamePaused) return;
        if (this.isGameRunning) {
            this.currentTime -= dt;
            if (this.currentTime <= 0) {
                this.currentTime = 0;
                this.isGameRunning = false;
                this.onTimeUp();
            }
            this.updateTimerLabel();
        }
        if (this.egg && this.egg.y < -1200 && this.eggScript) {
            this.eggScript.respawn();
        }
        if (this.player && this.player.y < -1200 && this.playerScript) {
            this.playerScript.respawn();
        }
    }
    updateTimerLabel() {
        if (this.timerLabel) {
            this.timerLabel.string = `${Math.ceil(this.currentTime)}`;
        }
    }

    onTimeUp() {
        cc.log("⏰ Time's up!");
        // 可以停遊戲、切場景、彈出 Game Over 畫面等
        cc.systemEvent.emit("GAME_OVER");
    }

    pauseGame() {
        this.isGamePaused = true;
        if (this.pauseOverlay) this.pauseOverlay.active = true;
        cc.log("🛑 遊戲暫停");
    }

    resumeGame() {
        this.isGamePaused = false;
        if (this.pauseOverlay) this.pauseOverlay.active = false;
        cc.log("▶ 遊戲繼續");
    }
}
