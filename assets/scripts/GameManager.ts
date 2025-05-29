const { ccclass, property } = cc._decorator;

@ccclass
export default class GameManager extends cc.Component {

    @property(cc.Node)
    egg: cc.Node = null;

    @property(cc.Node)
    player: cc.Node = null;

    private eggScript: any = null;
    private playerScript: any = null;

    onLoad() {
        const physicsMgr = cc.director.getPhysicsManager();
        physicsMgr.enabled = true;
        physicsMgr.debugDrawFlags =
            cc.PhysicsManager.DrawBits.e_aabbBit |
            cc.PhysicsManager.DrawBits.e_jointBit |
            cc.PhysicsManager.DrawBits.e_shapeBit;
    }

    start() {
        if (this.egg) this.eggScript = this.egg.getComponent("Egg");
        if (this.player) this.playerScript = this.player.getComponent("Player");
    }

    update(dt: number) {
        if (this.egg && this.egg.y < -1200 && this.eggScript) {
            this.eggScript.respawn();
        }
        if (this.player && this.player.y < -1200 && this.playerScript) {
            this.playerScript.respawn();
        }
    }
}
