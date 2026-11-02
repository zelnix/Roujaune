#!/usr/bin/env python3
"""
Backend API testing for ROUJAUNE cycling app - Startup crash investigation
"""
import requests
import json
import sys

BASE_URL = "https://scenic-trainer.preview.emergentagent.com/api"
TEST_EMAIL = "demo@roujaune.app"
TEST_PASSWORD = "demo9900"

def test_backend_health():
    """Test if backend is responding"""
    print("\n=== Testing Backend Health ===")
    try:
        # Try without auth first
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        print(f"❌ Health endpoint returned {response.status_code}: {response.text[:200]}")
        return False
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False

def test_login():
    """Test login with demo credentials"""
    print("\n=== Testing Login ===")
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            user = data.get("user", {})
            print(f"✅ Login successful")
            print(f"   User ID: {user.get('user_id')}")
            print(f"   Email: {user.get('email')}")
            print(f"   Onboarded: {user.get('onboarded')}")
            print(f"   Token: {token[:20]}..." if token else "   No token")
            return token
        else:
            print(f"❌ Login failed: {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return None
    except Exception as e:
        print(f"❌ Login error: {e}")
        return None

def test_authenticated_endpoints(token):
    """Test key endpoints that the home screen would call"""
    print("\n=== Testing Authenticated Endpoints (Home Screen) ===")
    headers = {"Authorization": f"Bearer {token}"}
    
    endpoints = [
        "/rider/settings",
        "/rider/profile", 
        "/rider/prefs",
        "/rider/season?days=7",
        "/rider/readiness/today",
        "/plan",
        "/progress/summary",
        "/billing/status",
        "/notifications/read-state",
    ]
    
    results = []
    for endpoint in endpoints:
        try:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, timeout=10)
            status = "✅" if response.status_code == 200 else "❌"
            print(f"{status} {endpoint}: {response.status_code}")
            if response.status_code != 200:
                print(f"   Error: {response.text[:200]}")
            results.append((endpoint, response.status_code == 200))
        except Exception as e:
            print(f"❌ {endpoint}: {e}")
            results.append((endpoint, False))
    
    return results

def check_for_circular_imports():
    """Check if there are any obvious circular import issues"""
    print("\n=== Checking for Potential Issues ===")
    print("Checking frontend structure...")
    # This would need to be done via file analysis
    print("⚠️  Manual check needed: Look for circular dependencies in frontend/app/index.tsx imports")

def main():
    print("=" * 60)
    print("ROUJAUNE Backend Testing - Startup Crash Investigation")
    print("=" * 60)
    
    # Test backend health
    test_backend_health()
    
    # Test login
    token = test_login()
    if not token:
        print("\n❌ Cannot proceed without valid token")
        sys.exit(1)
    
    # Test authenticated endpoints
    results = test_authenticated_endpoints(token)
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    passed = sum(1 for _, success in results if success)
    total = len(results)
    print(f"Endpoints tested: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    
    if passed == total:
        print("\n✅ All backend endpoints working correctly")
        print("⚠️  Crash is likely frontend-specific (native modules, imports, or rendering)")
    else:
        print("\n⚠️  Some backend endpoints failing - could contribute to crashes")
    
    print("\n" + "=" * 60)
    print("RECOMMENDATIONS")
    print("=" * 60)
    print("1. Check browser console for JavaScript errors")
    print("2. Look for unhandled promise rejections")
    print("3. Check if expo-keep-awake is causing issues on native")
    print("4. Verify react-native-google-cast plugin compatibility")
    print("5. Check for circular dependencies in component imports")

if __name__ == "__main__":
    main()
