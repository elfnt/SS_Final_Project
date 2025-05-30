const { ccclass, property } = cc._decorator;

@ccclass
export default class AudioSettingUI extends cc.Component {

    @property({ type: cc.Slider })
    bgmSlider: cc.Slider = null;

    onLoad() {
        // 初始化音量（從 localStorage 或預設）
        const savedVolume = parseFloat(localStorage.getItem("bgmVolume")) || 1;
        this.bgmSlider.progress = savedVolume;
        cc.audioEngine.setMusicVolume(savedVolume);
    }

    onBGMChanged(slider: cc.Slider) {
        const volume = slider.progress;  // 取得 0~1 的數值
        cc.audioEngine.setMusicVolume(volume); // 控制音量
        localStorage.setItem("bgmVolume", volume.toString()); // 儲存
    }
}
