plugins {
    id("com.android.application")
}

android {
    namespace = "com.karobar.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.karobar.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

// No external dependencies: plain android.webkit.WebView wrapper.
dependencies {
}
