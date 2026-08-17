plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.klanly.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.klanly.tv"
        // Android TV arranca en API 21; 24 va sobrado y coincide con la app movil
        minSdk = 24
        targetSdk = 34
        versionCode = 2
        versionName = "0.8.1"
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
    // Igual que la app movil: WebView del framework, sin AndroidX ni leanback.
    // La TV solo muestra, no navega, asi que no hace falta.
}
