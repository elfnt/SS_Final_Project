const { ccclass, property } = cc._decorator;

@ccclass
export default class Door extends cc.Component {

    onBeginContact(contact, selfCollider, otherCollider) {
        if (otherCollider.node.name === 'Egg') {
            // 👉 找到遮罩控制器
            const endMask = cc.find("Canvas/EndMaskOverlay");
            const controller = endMask.getComponent("EndMaskController");

            // 👉 叫它播放動畫，並在動畫結束後切場景
            controller.showEndingMask(
                otherCollider.node.convertToWorldSpaceAR(cc.Vec2.ZERO),
                () => {
                    cc.director.loadScene("MainMenu");
                }
            );

            // ❌ 暫時不要立即 destroy 蛋，會出錯！
            // otherCollider.node.destroy();
        }
    }
}
