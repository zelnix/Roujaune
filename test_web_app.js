const puppeteer = require('puppeteer');

(async () => {
  console.log('=== Testing Web App for Errors ===\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  
  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });
    if (type === 'error' || type === 'warning') {
      console.log(`[${type.toUpperCase()}] ${text}`);
    }
  });
  
  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
    console.log(`[PAGE ERROR] ${error.message}`);
  });
  
  // Collect failed requests
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure().errorText
    });
    console.log(`[REQUEST FAILED] ${request.url()}: ${request.failure().errorText}`);
  });
  
  try {
    console.log('Loading https://scenic-trainer.preview.emergentagent.com/\n');
    await page.goto('https://scenic-trainer.preview.emergentagent.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('\n✅ Page loaded successfully');
    
    // Wait a bit for any async errors
    await page.waitForTimeout(3000);
    
    // Check if login screen is visible
    const loginVisible = await page.evaluate(() => {
      return document.body.innerText.includes('login') || 
             document.body.innerText.includes('Login') ||
             document.querySelector('input[type="email"]') !== null;
    });
    
    console.log(`Login screen visible: ${loginVisible ? '✅' : '❌'}`);
    
    // Try to login
    console.log('\n=== Attempting Login ===');
    const emailInput = await page.$('input[type="email"]');
    const passwordInput = await page.$('input[type="password"]');
    
    if (emailInput && passwordInput) {
      await emailInput.type('demo@roujaune.app');
      await passwordInput.type('demo9900');
      
      // Find and click login button
      const loginButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        return buttons.find(b => b.textContent.toLowerCase().includes('log in') || b.textContent.toLowerCase().includes('sign in'));
      });
      
      if (loginButton) {
        await loginButton.click();
        console.log('✅ Login button clicked');
        
        // Wait for navigation or error
        await page.waitForTimeout(5000);
        
        const currentUrl = page.url();
        console.log(`Current URL: ${currentUrl}`);
        
        // Check if we're on the home screen
        const onHomeScreen = !currentUrl.includes('/login');
        console.log(`Navigated away from login: ${onHomeScreen ? '✅' : '❌'}`);
        
      } else {
        console.log('❌ Login button not found');
      }
    } else {
      console.log('❌ Email or password input not found');
    }
    
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }
  
  console.log('\n=== Summary ===');
  console.log(`Console errors: ${consoleMessages.filter(m => m.type === 'error').length}`);
  console.log(`Page errors: ${pageErrors.length}`);
  console.log(`Failed requests: ${failedRequests.length}`);
  
  if (pageErrors.length > 0) {
    console.log('\n=== Page Errors ===');
    pageErrors.forEach((err, i) => console.log(`${i + 1}. ${err}`));
  }
  
  await browser.close();
})();
