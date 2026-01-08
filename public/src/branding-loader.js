// branding-loader.js - Load branding settings dynamically
(function() {
  'use strict';

  let brandingSettings = {
    website_name: 'Photo Gallery',
    logo_path: null,
    hero_image_path: null,
    footer_text: 'Powered by PhotoBooth'
  };

  // Load branding settings from API
  async function loadBrandingSettings() {
    try {
      const response = await fetch('/api/branding/settings');
      if (response.ok) {
        brandingSettings = await response.json();
        applyBranding();
      }
    } catch (error) {
      console.warn('Could not load branding settings, using defaults');
      applyBranding();
    }
  }

  // Apply branding to current page
  function applyBranding() {
    // Update page title
    const titleElement = document.querySelector('title');
    if (titleElement && titleElement.textContent.includes('Photobooth') || titleElement.textContent.includes('Photo Gallery')) {
      const baseTitleParts = titleElement.textContent.split(' - ');
      if (baseTitleParts.length > 1) {
        titleElement.textContent = baseTitleParts[0] + ' - ' + brandingSettings.website_name;
      } else {
        titleElement.textContent = brandingSettings.website_name;
      }
    }

    // Update header title (for home page and admin)
    const headerTitle = document.querySelector('.header h1');
    if (headerTitle) {
      const iconHTML = headerTitle.querySelector('i') ? headerTitle.querySelector('i').outerHTML + ' ' : '';
      const textOnly = headerTitle.textContent.trim();
      
      // Replace "Photo Gallery" or "Admin Dashboard" with website name
      if (textOnly.includes('Photo Gallery')) {
        headerTitle.innerHTML = iconHTML + brandingSettings.website_name;
      } else if (textOnly.includes('Admin Dashboard')) {
        headerTitle.innerHTML = iconHTML + 'Admin Dashboard';
      }
    }

    // Update logo if exists
    if (brandingSettings.logo_path) {
      // Check if logo container exists
      let logoContainer = document.querySelector('.brand-logo-container');
      
      if (!logoContainer && headerTitle) {
        // Create logo container before header title
        logoContainer = document.createElement('div');
        logoContainer.className = 'brand-logo-container';
        // Use padding on top and bottom for consistent spacing around the logo
        logoContainer.style.cssText = 'text-align: center; padding: 20px 0;';
        
        const logoImg = document.createElement('img');
        logoImg.src = brandingSettings.logo_path;
        logoImg.alt = brandingSettings.website_name + ' Logo';
        logoImg.className = 'brand-logo';
        logoImg.style.cssText = 'max-width: 200px; max-height: 80px; object-fit: contain;';
        
        logoContainer.appendChild(logoImg);
        headerTitle.parentNode.insertBefore(logoContainer, headerTitle);
      } else if (logoContainer) {
        // Update existing logo
        const logoImg = logoContainer.querySelector('.brand-logo');
        if (logoImg) {
          logoImg.src = brandingSettings.logo_path;
          logoImg.alt = brandingSettings.website_name + ' Logo';
        }
      }
    }

    // Update hero image (for home page header)
    if (brandingSettings.hero_image_path) {
      const headerElement = document.querySelector('.header');
      if (headerElement) {
        const opacity = brandingSettings.hero_opacity ?? 0.5;
        const blur = brandingSettings.hero_blur_intensity ?? 10;
        
        // Create overlay with opacity
        const overlayOpacity = 1 - opacity; // Invert for darkness overlay
        
        headerElement.style.backgroundImage = `
          linear-gradient(rgba(0, 0, 0, ${overlayOpacity}), rgba(0, 0, 0, ${overlayOpacity})),
          url('${brandingSettings.hero_image_path}')
        `;
        headerElement.style.backgroundSize = 'cover';
        headerElement.style.backgroundPosition = 'center';
        headerElement.style.backgroundRepeat = 'no-repeat';
        headerElement.style.position = 'relative';
        headerElement.style.borderRadius = '16px';
        headerElement.style.overflow = 'hidden';
        // Remove default padding so hero content sits flush
        headerElement.style.padding = '0';
        
        // Apply blur via pseudo-element if blur > 0
        if (blur > 0) {
          
          // Add blur via CSS filter on background
          const styleId = 'hero-blur-style';
          let styleEl = document.getElementById(styleId);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
          }
          
          styleEl.textContent = `
            .header::before {
              content: '';
              position: absolute;
              top: -${blur}px;
              left: -${blur}px;
              right: -${blur}px;
              bottom: -${blur}px;
              background-image: url('${brandingSettings.hero_image_path}');
              background-size: cover;
              background-position: center;
              filter: blur(${blur}px);
              z-index: -1;
              border-radius: 16px;
            }
            .header {
              position: relative;
              background-image: linear-gradient(rgba(0, 0, 0, ${overlayOpacity}), rgba(0, 0, 0, ${overlayOpacity})) !important;
              border-radius: 16px;
              overflow: hidden;
            }
          `;
        }
        
        // Ensure text appearance follows branding settings
        headerElement.style.color = '#ffffff';
        const headerTitle = headerElement.querySelector('h1');
        const headerSubtitle = headerElement.querySelector('p');
        if (headerTitle) {
          if (brandingSettings.hero_title_color) headerTitle.style.color = brandingSettings.hero_title_color;
          else headerTitle.style.color = '#ffffff';
          if (brandingSettings.hero_text_shadow === false || brandingSettings.hero_text_shadow === 0) {
            headerTitle.style.textShadow = 'none';
          } else {
            headerTitle.style.textShadow = '0 2px 4px rgba(0, 0, 0, 0.8)';
          }
          if (brandingSettings.hero_text_align) headerTitle.style.textAlign = brandingSettings.hero_text_align;
        }
        if (headerSubtitle) {
          if (brandingSettings.hero_subtitle_color) headerSubtitle.style.color = brandingSettings.hero_subtitle_color;
          else headerSubtitle.style.color = 'rgba(255, 255, 255, 0.9)';
          if (brandingSettings.hero_text_shadow === false || brandingSettings.hero_text_shadow === 0) {
            headerSubtitle.style.textShadow = 'none';
          } else {
            headerSubtitle.style.textShadow = '0 1px 3px rgba(0, 0, 0, 0.8)';
          }
          if (brandingSettings.hero_text_align) headerSubtitle.style.textAlign = brandingSettings.hero_text_align;
        }
      }
    }

    // Update gallery page title (dynamic gallery pages)
    const galleryTitle = document.querySelector('.gallery-title');
    if (galleryTitle && galleryTitle.textContent.includes('Reflection Photography')) {
      galleryTitle.textContent = brandingSettings.website_name;
    }

    // Update footer text
    const footerTextElement = document.getElementById('footerText');
    if (footerTextElement) {
      footerTextElement.textContent = brandingSettings.footer_text || 'Powered by PhotoBooth';
    }

    // Dispatch event for other scripts to react
    window.dispatchEvent(new CustomEvent('brandingLoaded', { detail: brandingSettings }));
  }

  // Get branding settings (for other scripts)
  window.getBrandingSettings = function() {
    return brandingSettings;
  };

  // Reload branding (for admin panel after update)
  window.reloadBranding = async function() {
    await loadBrandingSettings();
  };

  // Auto-load on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBrandingSettings);
  } else {
    loadBrandingSettings();
  }
})();
