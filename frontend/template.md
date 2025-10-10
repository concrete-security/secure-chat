# Concrete AI Template Guide

## Overview
This template guide provides a comprehensive design system for the Concrete AI / Confidential AI product interface. The design emphasizes security, privacy, and modern cryptography through clean typography and a distinctive color palette.

## Brand Identity
**Product Name:** Concrete AI  
**Tagline:** "Confidential AI for sensitive data — security, privacy, and confidentiality backed by modern cryptography."

## Color Palette

### Primary Colors
- **Background Gray:** `#E2E2E2` - Main background color
- **Deep Blue:** `#1B0986` - Primary brand color
- **Pure Black:** `#000000` - Text and emphasis
- **Pure White:** `#FFFFFF` - Button text and icons

### Gradient Effects
1. **Transparent Black Gradient:**  
   `linear-gradient(211.15deg, rgba(0, 0, 0, 0) 18.84%, rgba(0, 0, 0, 0.2) 103.94%)`

2. **Mixed Overlay Gradient:**  
   `linear-gradient(231.82deg, rgba(226, 226, 226, 0.2) 8.09%, rgba(27, 9, 134, 0.2) 105.85%)`

3. **Radial Brand Gradient:**  
   `radial-gradient(93% 736.36% at 38% -100%, #E2E2E2 24.46%, #1B0986 100%)`

## Typography

### Font Family
- **Primary Font:** Telegraf
- **Fallback:** System fonts

### Type Styles

#### Main Heading
```css
font-family: 'Telegraf';
font-weight: 700;
font-size: 52px;
line-height: 55px;
color: #000000;
```

#### Body Text
```css
font-family: 'Telegraf';
font-weight: 400;
font-size: 16px;
line-height: 22px; /* 138% */
color: #000000;
```

#### Button Text
```css
font-family: 'Telegraf';
font-weight: 400;
font-size: 14px;
line-height: 15px;
```

## Component Library

### 1. Main Container
- **Dimensions:** 871px × 495px
- **Background:** `#E2E2E2`
- **Position:** Relative

### 2. Content Section
- **Width:** 848px × 440px
- **Position:** Absolute
- **Background:** `#E2E2E2`

### 3. Button Components

#### Primary Button (Filled)
```css
display: flex;
flex-direction: row;
justify-content: center;
align-items: center;
padding: 10px 12px;
gap: 10px;
width: 150px;
height: 36px;
background: #000000;
color: #FFFFFF;
```

#### Secondary Button (Outlined)
```css
display: flex;
flex-direction: row;
justify-content: center;
align-items: center;
padding: 10px 12px;
gap: 10px;
width: 150px;
height: 36px;
border: 1px solid #000000;
color: #000000;
background: transparent;
```

### 4. Icon Card Component
```css
display: flex;
flex-direction: column;
align-items: flex-start;
padding: 30px;
gap: 17px;
width: 289px;
height: 204px;
background: #E2E2E2;
```

#### Icon Badge
```css
display: flex;
flex-direction: row;
align-items: center;
padding: 6px;
gap: 10px;
width: 29px;
height: 29px;
background: #1B0986;
/* Icon color: #FFFFFF */
```

### 5. Gradient Header
- **Dimensions:** 871px × 110px
- **Effect:** Radial gradient from gray to deep blue

## Layout Guidelines

### Spacing System
- **Large Gap:** 30px (card padding)
- **Medium Gap:** 17px (between elements in cards)
- **Small Gap:** 10px (button internal spacing)
- **Padding:** 10px vertical, 12px horizontal (buttons)

### Content Positioning
- **Hero Title Position:** 75px left, 188px top
- **Description Position:** 75px left, 268px top
- **Max Text Width:** 389px for descriptions

### Component Dimensions
- **Color Swatches:** 67px × 67px
- **Swatch Spacing:** 79px between centers
- **Button Container:** 324px width
- **Button Spacing:** 174px between buttons

## Implementation Notes

### Responsive Considerations
- Fixed widths are specified - consider converting to responsive units
- Maintain aspect ratios for gradient effects
- Ensure text remains readable on all backgrounds

### Accessibility
- Ensure sufficient color contrast (black on gray background)
- Add hover states for interactive elements
- Include focus indicators for keyboard navigation

### Browser Compatibility
- Radial gradient may need vendor prefixes
- Flexbox properties are widely supported
- Custom font loading requires @font-face declaration

## Usage Examples

### Hero Section Structure
```html
<div class="container">
  <h1 class="hero-title">Concrete AI</h1>
  <p class="hero-description">
    Confidential AI for sensitive data — security, 
    privacy, and confidentiality backed by modern 
    cryptography.
  </p>
  <div class="button-group">
    <button class="btn-primary">Try Confidential AI</button>
    <button class="btn-secondary">Try Confidential AI</button>
  </div>
</div>
```

### Icon Card Structure
```html
<div class="icon-card">
  <div class="icon-badge">
    <!-- SVG icon here -->
  </div>
  <p class="card-description">
    Confidential AI for sensitive data — security, 
    privacy, and confidentiality backed by modern 
    cryptography.
  </p>
</div>
```

## Best Practices

1. **Maintain Consistency:** Use the established color palette throughout
2. **Typography Hierarchy:** Stick to the defined font sizes and weights
3. **Spacing Rhythm:** Follow the gap system for consistent spacing
4. **Brand Voice:** Keep copy concise and focused on security/privacy themes
5. **Visual Balance:** Use the gradient effects sparingly for emphasis

## File Structure Recommendation
```
/assets
  /fonts
    - telegraf.woff2
  /images
    - icons.svg
/styles
  - variables.css
  - components.css
  - layout.css
  - utilities.css
```