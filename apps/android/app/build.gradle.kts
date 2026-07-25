plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.klanly.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.klanly.app"
        minSdk = 24
        targetSdk = 34
        versionCode = 5
        versionName = "0.5.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // App liviana basada en WebView (sin AndroidX extra) para un APK pequeno y confiable.
}

