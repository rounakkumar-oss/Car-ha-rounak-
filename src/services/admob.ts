/**
 * Google AdMob Integration Service for Flying Car Rush 3D (Android APK & WebView)
 *
 * Configured with exact production AdMob IDs:
 * - AdMob App ID:   ca-app-pub-1090143273371894~5007097206
 * - App Open Ad ID: ca-app-pub-1090143273371894/6658468100
 * - Banner Ad ID:   ca-app-pub-1090143273371894/7441688854
 */

export const ADMOB_CONFIG = {
  APP_ID: 'ca-app-pub-1090143273371894~5007097206',
  APP_OPEN_AD_ID: 'ca-app-pub-1090143273371894/6658468100',
  BANNER_AD_ID: 'ca-app-pub-1090143273371894/7441688854',
} as const;

export const ANDROID_MANIFEST_META_DATA_SNIPPET = `<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-1090143273371894~5007097206"/>`;

interface CapacitorAdMobPlugin {
  initialize?: (options?: { initializeForTesting?: boolean }) => Promise<void>;
  showBanner?: (options: {
    adId: string;
    adSize?: string;
    position?: string;
    margin?: number;
    isTesting?: boolean;
  }) => Promise<void>;
  hideBanner?: () => Promise<void>;
  loadAppOpen?: (options: { adId: string; isTesting?: boolean }) => Promise<void>;
  showAppOpen?: () => Promise<void>;
  prepareInterstitial?: (options: { adId: string; isTesting?: boolean }) => Promise<void>;
  showInterstitial?: () => Promise<void>;
}

interface CordovaAdMob {
  banner?: {
    config: (opts: { id: string; isTesting?: boolean; autoShow?: boolean }) => void;
    prepare: () => void;
    show: () => void;
  };
  appOpen?: {
    load: (opts: { adUnitId: string }) => Promise<void>;
    show: () => Promise<void>;
  };
  AppOpenAd?: {
    load: (opts: { adUnitId: string }) => Promise<{ show: () => Promise<void> }>;
  };
}

interface AndroidWebViewAdMobBridge {
  initializeAdMob?: (appId: string) => void;
  showAppOpenAd?: (adUnitId: string) => void;
  showBannerAd?: (adUnitId: string) => void;
}

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        AdMob?: CapacitorAdMobPlugin;
      };
    };
    admob?: CordovaAdMob;
    AndroidAdMob?: AndroidWebViewAdMobBridge;
  }
}

class AdMobService {
  private initialized = false;
  private nativeBridgeActive = false;

  /**
   * 1. Initialize Google AdMob when the game starts.
   * Supports Capacitor (@capacitor-community/admob), Cordova (admob-plus-cordova),
   * and custom Android WebView JavascriptInterface (window.AndroidAdMob).
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) return this.nativeBridgeActive;

    try {
      // Check Android Native WebView JavascriptInterface Bridge
      if (window.AndroidAdMob?.initializeAdMob) {
        window.AndroidAdMob.initializeAdMob(ADMOB_CONFIG.APP_ID);
        this.nativeBridgeActive = true;
        this.initialized = true;
        return true;
      }

      // Check Capacitor AdMob Plugin
      const capAdMob = window.Capacitor?.Plugins?.AdMob;
      if (capAdMob?.initialize) {
        await capAdMob.initialize({ initializeForTesting: false });
        this.nativeBridgeActive = true;
        this.initialized = true;
        return true;
      }

      // Check Cordova AdMob Plus Plugin
      if (window.admob) {
        this.nativeBridgeActive = true;
        this.initialized = true;
        return true;
      }
    } catch {
      // Fallback to hybrid/web container mode if native plugin is not yet attached
    }

    this.initialized = true;
    return this.nativeBridgeActive;
  }

  /**
   * 2. Load and show the App Open Ad (ca-app-pub-1090143273371894/6658468100)
   * immediately on app launch / splash screen.
   */
  public async showAppOpenAd(): Promise<boolean> {
    await this.initialize();

    try {
      // 1. Custom Android WebView Bridge
      if (window.AndroidAdMob?.showAppOpenAd) {
        window.AndroidAdMob.showAppOpenAd(ADMOB_CONFIG.APP_OPEN_AD_ID);
        return true;
      }

      // 2. Capacitor AdMob Plugin
      const capAdMob = window.Capacitor?.Plugins?.AdMob;
      if (capAdMob) {
        if (capAdMob.loadAppOpen && capAdMob.showAppOpen) {
          await capAdMob.loadAppOpen({
            adId: ADMOB_CONFIG.APP_OPEN_AD_ID,
            isTesting: false,
          });
          await capAdMob.showAppOpen();
          return true;
        }
        if (capAdMob.prepareInterstitial && capAdMob.showInterstitial) {
          await capAdMob.prepareInterstitial({
            adId: ADMOB_CONFIG.APP_OPEN_AD_ID,
            isTesting: false,
          });
          await capAdMob.showInterstitial();
          return true;
        }
      }

      // 3. Cordova AdMob Plus Plugin
      if (window.admob?.AppOpenAd) {
        const ad = await window.admob.AppOpenAd.load({
          adUnitId: ADMOB_CONFIG.APP_OPEN_AD_ID,
        });
        await ad.show();
        return true;
      }
    } catch {
      // Ignore native bridge error and allow UI splash handler to complete
    }

    return false;
  }

  /**
   * 3. Show fixed bottom Banner Ad (ca-app-pub-1090143273371894/7441688854)
   */
  public async showBottomBannerAd(): Promise<boolean> {
    await this.initialize();

    try {
      // 1. Custom Android WebView Bridge
      if (window.AndroidAdMob?.showBannerAd) {
        window.AndroidAdMob.showBannerAd(ADMOB_CONFIG.BANNER_AD_ID);
        return true;
      }

      // 2. Capacitor AdMob Plugin
      const capAdMob = window.Capacitor?.Plugins?.AdMob;
      if (capAdMob?.showBanner) {
        await capAdMob.showBanner({
          adId: ADMOB_CONFIG.BANNER_AD_ID,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: 0,
          isTesting: false,
        });
        return true;
      }

      // 3. Cordova AdMob Plugin
      if (window.admob?.banner) {
        window.admob.banner.config({
          id: ADMOB_CONFIG.BANNER_AD_ID,
          isTesting: false,
          autoShow: true,
        });
        window.admob.banner.prepare();
        return true;
      }
    } catch {
      // Ignore native bridge error and render reserved bottom banner slot
    }

    return false;
  }

  public isNativeBridgeDetected(): boolean {
    return this.nativeBridgeActive;
  }
}

export const adMobService = new AdMobService();
