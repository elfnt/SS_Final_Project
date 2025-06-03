const { ccclass, property } = cc._decorator;

@ccclass
export default class Door extends cc.Component {

    onBeginContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === 'Player') {
            // 銷毀 player
            otherCollider.node.destroy();

            // 等 0.1 秒後切換場景（避免立即 destroy 時報錯）
            this.scheduleOnce(() => {
                cc.director.loadScene("MainMenu");
            }, 0.1);
        }
    }
}
