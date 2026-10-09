"""Rifinitura fotografica con IA (software libero): Stable Diffusion 1.5 "Realistic Vision 5.1" + ControlNet.
Parte dal render Blender e ne conserva linee e posizioni: l'IA aggiunge l'aspetto fotografico (micro-dettagli, luce,
imperfezioni), non deve cambiare l'arredo. Le immagini servono a presentare l'atmosfera: per misure e coperti fa fede
il modello 3D verificato.
Uso: python ai_rifinitura.py <render.png> <uscita.png> "<descrizione>" [forza 0.4] [seme] [profondita.png] [quadri.png]
  - con la mappa di profondita' esatta (mappe_ia.py) si usano due ControlNet (contorni + profondita'): la geometria resta
    bloccata anche con una forza piu' alta, quindi l'IA puo' rifare davvero superfici e luce
  - la maschera dei quadri rimette al loro posto le stampe originali (l'IA storpierebbe scritte e disegni)
Modelli (Hugging Face): SG161222/Realistic_Vision_V5.1_noVAE, lllyasviel/control_v11p_sd15_canny,
lllyasviel/control_v11f1p_sd15_depth, stabilityai/sd-vae-ft-mse"""
import sys, time
import numpy as np, cv2, torch
from PIL import Image, ImageFilter
from diffusers import StableDiffusionControlNetImg2ImgPipeline, ControlNetModel, AutoencoderKL, DPMSolverMultistepScheduler

src, dst, scena = sys.argv[1], sys.argv[2], sys.argv[3]
forza = float(sys.argv[4]) if len(sys.argv) > 4 else 0.4
seme = int(sys.argv[5]) if len(sys.argv) > 5 else 7
prof = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != '-' else None
quadri = sys.argv[7] if len(sys.argv) > 7 else None
W, H = 1024, 576
torch.set_num_threads(4)

nets = [ControlNetModel.from_pretrained('lllyasviel/control_v11p_sd15_canny', variant='fp16', torch_dtype=torch.float32)]
if prof: nets.append(ControlNetModel.from_pretrained('lllyasviel/control_v11f1p_sd15_depth', variant='fp16', torch_dtype=torch.float32))
vae = AutoencoderKL.from_pretrained('stabilityai/sd-vae-ft-mse', torch_dtype=torch.float32)
pipe = StableDiffusionControlNetImg2ImgPipeline.from_pretrained('SG161222/Realistic_Vision_V5.1_noVAE', controlnet=nets if prof else nets[0], vae=vae,
                                                                torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True, algorithm_type='dpmsolver++', solver_type='midpoint', final_sigmas_type='sigma_min')
pipe.set_progress_bar_config(disable=True)

orig = Image.open(src).convert('RGB')
img = orig.resize((W, H), Image.LANCZOS)
edges = cv2.Canny(np.array(img), 60, 160)
ctrl = [Image.fromarray(np.stack([edges] * 3, -1))]
scale = [0.85]
if prof:
    ctrl.append(Image.open(prof).convert('RGB').resize((W, H), Image.BILINEAR)); scale = [0.55, 0.9]

prompt = ('RAW photo, ' + scena + ', interior of an Italian trattoria in Milan in the evening, photographed with a full frame camera, '
          'clear empty crystal wine glasses, white porcelain plates, warm tungsten light from the pendant lamps, light falloff, soft shadows, real wood grain, worn surfaces, subtle dust and '
          'imperfections, slightly uneven plaster, natural color, film grain, Canon EOS R5, 24mm, f/4, ISO 1600, editorial interior photography')
neg = ('cartoon, 3d render, cgi, render, unreal engine, octane, videogame, painting, illustration, drawing, anime, plastic, glossy, '
       'perfect, clean, symmetrical, green glass, tinted glass, colored glasses, low quality, blurry, deformed, distorted, text, watermark, logo, people, person, oversaturated, orange tint')
t = time.time()
out = pipe(prompt=prompt, negative_prompt=neg, image=img, control_image=ctrl if prof else ctrl[0], strength=forza, num_inference_steps=30,
           guidance_scale=5.5, controlnet_conditioning_scale=scale if prof else scale[0], generator=torch.Generator().manual_seed(seme)).images[0]
if quadri:   # stampe d'arte: le originali, con il bordo sfumato di un paio di pixel
    m = Image.open(quadri).convert('L').resize((W, H), Image.NEAREST).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = Image.composite(img, out, m)
out.save(dst)
print(f'fatto {dst} {time.time() - t:.0f}s', flush=True)
