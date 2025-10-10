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

### 1. Frame 1 (Main Container)
```css
position: relative;
width: 871px;
height: 495px;
background: #E2E2E2;
```

### 2. Text on a Path (Content Section)
```css
position: absolute;
width: 848px;
height: 440px;
background: #E2E2E2;
```

### 3. Buttons Container
```css
position: relative;
width: 324px;
height: 36px;
```

#### Primary Button (Filled)
```css
display: flex;
flex-direction: row;
justify-content: center;
align-items: center;
padding: 10px 12px;
gap: 10px;
position: absolute;
width: 150px;
height: 36px;
left: 0px;
top: 0px;
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
position: absolute;
width: 150px;
height: 36px;
left: 174px;
top: 0px;
border: 1px solid #000000;
color: #000000;
```

### 4. Colors (Palette Display)
```css
position: relative;
width: 305px;
height: 67px;
```
- Contains 4 color swatches (67px × 67px each)
- Swatches positioned at: 0px, 79px, 158px, 238px (left positions)

### 5. Gradient Section
```css
position: relative;
width: 871px;
height: 110px;
```
- Contains radial gradient background

### 6. Icon + Text Card
```css
display: flex;
flex-direction: column;
align-items: flex-start;
padding: 30px;
gap: 17px;
position: relative;
width: 289px;
height: 204px;
background: #E2E2E2;
```

#### Icon Badge within Card
```css
display: flex;
flex-direction: row;
align-items: center;
padding: 6px;
gap: 10px;
width: 29px;
height: 29px;
background: #1B0986;
```

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
- **Frame 1 (Main):** 871px × 495px (relative)
- **Text on Path:** 848px × 440px (absolute)
- **Gradient Section:** 871px × 110px (relative)
- **Buttons Container:** 324px × 36px (relative)
- **Individual Buttons:** 150px × 36px (absolute within container)
- **Colors Container:** 305px × 67px (relative)
- **Color Swatches:** 67px × 67px each
- **Icon + Text Card:** 289px × 204px (relative, flexbox)
- **Button Spacing:** 174px left offset for second button

## Implementation Notes

### Positioning Strategy
The template uses a mixed positioning approach:
- **Relative positioning:** Frame 1, Buttons container, Colors container, Gradient section, Icon + Text card
- **Absolute positioning:** Text on Path overlay, Individual buttons within container, Text elements within sections

### Component Hierarchy
1. **Frame 1** (871px × 495px) - Main relative container
   - **Text on Path** (848px × 440px) - Absolute overlay
   - **Gradient** (871px × 110px) - Relative section
   - **Buttons Container** (324px × 36px) - Relative wrapper
     - Individual buttons positioned absolutely within
   - **Colors** (305px × 67px) - Relative palette display
   - **Icon + Text** (289px × 204px) - Relative flexbox card

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

## Version History
- **v1.0:** Initial template guide based on provided CSS specifications