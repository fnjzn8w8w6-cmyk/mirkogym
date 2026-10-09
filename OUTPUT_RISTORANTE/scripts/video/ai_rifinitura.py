"""Rifinitura fotografica con IA (software libero): Stable Diffusion 1.5 "Realistic Vision 5.1" + ControlNet Canny.
Parte dal render Blender e ne conserva linee e posizioni (ControlNet sui contorni del render, img2img a forza moderata):
l'IA aggiunge l'aspetto fotografico (micro-dettagli, luce, imperfezioni), non deve cambiare l'arredo.
Le immagini ottenute servono a presentare l'atmosfera: per misure e coperti fa fede il modello 3D verificato.
Uso: python ai_rifinitura.py <render.png> <uscita.png> "<descrizione della scena>" [forza 0.4] [seme]
Modelli (Hugging Face): SG161222/Realistic_Vision_V5.1_noVAE, lllyasviel/control_v11p_sd15_canny, stabilityai/sd-vae-ft-mse"""
import sys, time
import numpy as np, cv2, torch
from PIL import Image
from diffusers import StableDiffusionControlNetImg2ImgPipeline, ControlNetModel, AutoencoderKL, DPMSolverMultistepScheduler

src, dst, scena = sys.argv[1], sys.argv[2], sys.argv[3]
forza = float(sys.argv[4]) if len(sys.argv) > 4 else 0.4
seme = int(sys.argv[5]) if len(sys.argv) > 5 else 7
W, H = 1024, 576
torch.set_num_threads(4)

cn = ControlNetModel.from_pretrained('lllyasviel/control_v11p_sd15_canny', variant='fp16', torch_dtype=torch.float32)
vae = AutoencoderKL.from_pretrained('stabilityai/sd-vae-ft-mse', torch_dtype=torch.float32)
pipe = StableDiffusionControlNetImg2ImgPipeline.from_pretrained('SG161222/Realistic_Vision_V5.1_noVAE', controlnet=cn, vae=vae,
                                                                torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True, algorithm_type='dpmsolver++', solver_type='midpoint', final_sigmas_type='sigma_min')
pipe.set_progress_bar_config(disable=True)

img = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)
edges = cv2.Canny(np.array(img), 60, 160)
ctrl = Image.fromarray(np.stack([edges] * 3, -1))

prompt = ('RAW photo, ' + scena + ', interior of an elegant Italian restaurant in Milan in the evening, warm ambient light, '
          'realistic materials, subtle imperfections, natural shadows, depth of field, 35mm photograph, Canon EOS R5, f/4, '
          'high dynamic range, sharp focus, highly detailed, professional interior photography')
neg = ('cartoon, 3d render, cgi, render, painting, illustration, drawing, anime, plastic, low quality, blurry, deformed, '
       'distorted, text, watermark, logo, people, person, oversaturated, orange tint')
t = time.time()
out = pipe(prompt=prompt, negative_prompt=neg, image=img, control_image=ctrl, strength=forza, num_inference_steps=30,
           guidance_scale=5.5, controlnet_conditioning_scale=0.85, generator=torch.Generator().manual_seed(seme)).images[0]
out.save(dst)
print(f'fatto {dst} {time.time() - t:.0f}s', flush=True)
