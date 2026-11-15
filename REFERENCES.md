# References

This is the list of every external resource used in Spectral Blink (including data, services, libraries and fonts).

## NASA data
- SPHEREx Level-2 spectral images, Data Release 1 (`spherex_dr1`) and Quick Release 3 (`spherex_qr3`).
  NASA/IPAC Infrared Science Archive (IRSA). https://irsa.ipac.caltech.edu/Missions/spherex.html
  - IRSA Simple Image Access (SIA) service: https://irsa.ipac.caltech.edu/SIA
  - IRSA image cutout service (IBE)
  - SPHEREx Explanatory Supplement (flag bits, wavelength calibration)
  - IRSA SPHEREx tutorial notebooks (data access patterns, spectral WCS): https://caltech-ipac.github.io/irsa-tutorials/
- Inspiration: WiseView (Caselden et al.), https://github.com/dancaselden/WiseView, and Backyard Worlds: Planet 9, https://backyardworlds.org

## Other data and services
- ESA Gaia DR3 (Gaia Collaboration, Vallenari et al. 2023), queried through the Gaia Archive TAP service: https://gea.esac.esa.int/archive/
- CDS Sesame name resolver (SIMBAD) for target names, positions and proper motions. Centre de Données astronomiques de Strasbourg. https://cds.unistra.fr/

## Python libraries (backend)
- Astropy (Astropy Collaboration 2013, 2018, 2022)
- reproject
- NumPy, SciPy
- FastAPI, Uvicorn, HTTPX
- astroquery and pyvo (used during data exploration)

## JavaScript libraries (frontend)
- React, Vite, TypeScript
- Tailwind CSS
- Motion (Framer Motion), for animation
- Zustand, for state management
- Recharts, for charts
- Radix UI (Slider, Tooltip)
- lucide-react, for icons
- sonner, for toasts
- clsx

## Fonts
- Inter, Space Grotesk and JetBrains Mono (Google Fonts, SIL Open Font License)

## Tools
- Claude code was used to help make this project, allowed under the 'Super Intelligence' clause of the competition.

No copyrighted images, music or text were used. All imagery shown in the app is NASA SPHEREx data rendered live.
