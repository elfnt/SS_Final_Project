const { ccclass, property } = cc._decorator;

@ccclass
export default class ResumeButtonHandler extends cc.Component {
    @property(cc.Node) gameManager: cc.Node = null;

    onResumeClicked() {
        this.gameManager.getComponent("GameManager").resumeGame();
    }
}
