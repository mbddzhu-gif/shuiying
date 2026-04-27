<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';

// 图片相关状态
const imageFile = ref<File | null>(null);
const imageUrl = ref<string>('');
const originalImage = ref<HTMLImageElement | null>(null);
const exportCanvas = ref<HTMLCanvasElement | null>(null);
const previewContainer = ref<HTMLElement | null>(null);

// 水印相关状态
const watermarkText = ref('水印文字');
const watermarkSize = ref(30);
const watermarkOpacity = ref(50);
const watermarkColor = ref('#ffffff');

// 水印铺满相关状态
const watermarkSpacingX = ref(80);
const watermarkSpacingY = ref(60);
const watermarkAngle = ref(-30);

// 导出相关状态
const exportFormat = ref('png');
const exportQuality = ref(0.9);

// 预览相关
const previewWatermarks = ref<Array<{x: number, y: number}>>([]);

// 计算属性
const containerStyle = computed(() => {
  if (!originalImage.value) return {};
  const img = originalImage.value;
  return {
    width: '600px',
    height: `${(img.height / img.width) * 600}px`
  };
});

// 计算预览水印位置
const calculatePreviewWatermarks = () => {
  if (!previewContainer.value || !watermarkText.value) {
    previewWatermarks.value = [];
    return;
  }

  const container = previewContainer.value;
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  
  const spacingX = Math.max(20, watermarkSpacingX.value * 0.4);
  const spacingY = Math.max(15, watermarkSpacingY.value * 0.4);

  const marks: Array<{x: number, y: number}> = [];
  
  for (let y = -spacingY; y < containerHeight + spacingY; y += spacingY) {
    for (let x = -spacingX; x < containerWidth + spacingX; x += spacingX) {
      const offsetX = (y / spacingY) % 2 === 0 ? spacingX / 2 : 0;
      marks.push({ x: x + offsetX, y });
    }
  }

  previewWatermarks.value = marks;
};

// 图片上传处理
const handleImageUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    imageFile.value = target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      imageUrl.value = e.target?.result as string;
    };
    reader.readAsDataURL(imageFile.value);
  }
};

// 图片加载完成
const onImageLoad = () => {
  if (originalImage.value) {
    nextTick(() => {
      calculatePreviewWatermarks();
      prepareExportCanvas();
    });
  }
};

// 准备导出画布
const prepareExportCanvas = () => {
  if (!exportCanvas.value || !originalImage.value) return;
  
  const img = originalImage.value;
  const canvas = exportCanvas.value;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return;

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  ctx.drawImage(img, 0, 0);
  
  if (!watermarkText.value) return;

  ctx.save();
  ctx.globalAlpha = watermarkOpacity.value / 100;
  ctx.fillStyle = watermarkColor.value;
  ctx.font = `bold ${watermarkSize.value}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const spacingX = watermarkSpacingX.value;
  const spacingY = watermarkSpacingY.value;

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(watermarkAngle.value * Math.PI / 180);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  for (let y = -spacingY; y < canvas.height + spacingY; y += spacingY) {
    for (let x = -spacingX; x < canvas.width + spacingX; x += spacingX) {
      const offsetX = (Math.floor(y / spacingY)) % 2 === 0 ? spacingX / 2 : 0;
      ctx.fillText(watermarkText.value, x + offsetX, y);
    }
  }

  ctx.restore();
};

// 导出图片
const exportImage = () => {
  if (!exportCanvas.value) return;
  
  prepareExportCanvas();
  
  setTimeout(() => {
    const canvas = exportCanvas.value;
    if (!canvas) return;

    let mimeType = 'image/png';
    if (exportFormat.value === 'jpeg') {
      mimeType = 'image/jpeg';
    } else if (exportFormat.value === 'webp') {
      mimeType = 'image/webp';
    }

    const quality = exportFormat.value === 'png' ? undefined : exportQuality.value;
    const dataUrl = canvas.toDataURL(mimeType, quality);
    
    const link = document.createElement('a');
    link.download = `watermarked-image.${exportFormat.value === 'jpeg' ? 'jpg' : exportFormat.value}`;
    link.href = dataUrl;
    link.click();
  }, 100);
};

// 监听水印参数变化
watch([watermarkText, watermarkSize, watermarkOpacity, watermarkSpacingX, watermarkSpacingY, watermarkAngle], () => {
  nextTick(() => {
    calculatePreviewWatermarks();
  });
});

// 生命周期
onMounted(() => {
  window.addEventListener('resize', calculatePreviewWatermarks);
});
</script>

<template>
  <div class="app-container">
    <h1>图片加水印工具</h1>
    
    <!-- 图片上传区域 -->
    <div class="upload-section">
      <input 
        type="file"
        id="file-upload"
        accept="image/*"
        @change="handleImageUpload"
        class="file-input"
      />
      <label for="file-upload" class="upload-label">
        选择图片
      </label>
    </div>
    
    <!-- 预览和编辑区域 -->
    <div class="editor-section">
      <!-- 预览区域 -->
      <div class="preview-wrapper">
        <div 
          v-if="imageUrl" 
          ref="previewContainer"
          class="preview-container"
          :style="containerStyle"
        >
          <img 
            :src="imageUrl" 
            class="preview-image"
            @load="onImageLoad"
            ref="originalImage"
          />
          <div 
            class="watermarks-overlay"
            :style="{ opacity: watermarkOpacity / 100 }"
          >
            <span 
              v-for="(mark, index) in previewWatermarks" 
              :key="index"
              class="watermark-text"
              :style="{
                left: mark.x + 'px',
                top: mark.y + 'px',
                fontSize: Math.max(12, watermarkSize * 0.4) + 'px',
                transform: `rotate(${watermarkAngle}deg)`,
                color: watermarkColor
              }"
            >
              {{ watermarkText }}
            </span>
          </div>
        </div>
        <div class="no-image" v-else>
          请上传图片
        </div>
        
        <!-- 隐藏的导出画布 -->
        <canvas ref="exportCanvas" class="export-canvas"></canvas>
      </div>
      
      <!-- 控制面板 -->
      <div class="control-panel">
        <div class="control-group">
          <label>水印文字</label>
          <input 
            type="text" 
            v-model="watermarkText"
            placeholder="输入水印文字"
          />
        </div>

        <div class="control-group">
          <label>水印颜色</label>
          <div class="color-picker">
            <input 
              type="color" 
              v-model="watermarkColor"
              class="color-input"
            />
            <span>{{ watermarkColor }}</span>
          </div>
        </div>
        
        <div class="control-group">
          <label>文字大小: {{ watermarkSize }}px</label>
          <input 
            type="range" 
            min="10" 
            max="100" 
            v-model.number="watermarkSize"
          />
        </div>

        <div class="control-group">
          <label>水印密度 X: {{ watermarkSpacingX }}px</label>
          <input 
            type="range" 
            min="20" 
            max="200" 
            v-model.number="watermarkSpacingX"
          />
        </div>

        <div class="control-group">
          <label>水印密度 Y: {{ watermarkSpacingY }}px</label>
          <input 
            type="range" 
            min="20" 
            max="200" 
            v-model.number="watermarkSpacingY"
          />
        </div>

        <div class="control-group">
          <label>水印角度: {{ watermarkAngle }}°</label>
          <input 
            type="range" 
            min="-90" 
            max="90" 
            v-model.number="watermarkAngle"
          />
        </div>
        
        <div class="control-group">
          <label>透明度: {{ watermarkOpacity }}%</label>
          <input 
            type="range" 
            min="10" 
            max="100" 
            v-model.number="watermarkOpacity"
          />
        </div>
        
        <div class="control-group">
          <label>导出格式</label>
          <select v-model="exportFormat">
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
        
        <div class="control-group" v-if="exportFormat !== 'png'">
          <label>导出质量: {{ Math.round(exportQuality * 100) }}%</label>
          <input 
            type="range" 
            min="0.1" 
            max="1" 
            step="0.1" 
            v-model.number="exportQuality"
          />
        </div>
        
        <button 
          class="export-btn" 
          @click="exportImage"
          :disabled="!imageUrl"
        >
          导出图片
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

h1 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
}

.upload-section {
  text-align: center;
  margin-bottom: 30px;
}

.file-input {
  display: none;
}

.upload-label {
  display: inline-block;
  padding: 10px 20px;
  background-color: #4CAF50;
  color: white;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
}

.upload-label:hover {
  background-color: #45a049;
}

.editor-section {
  display: flex;
  gap: 30px;
  align-items: flex-start;
  justify-content: center;
}

.preview-wrapper {
  position: relative;
}

.preview-container {
  position: relative;
  max-width: 600px;
  border: 1px solid #ddd;
  border-radius: 5px;
  overflow: hidden;
  background: #f0f0f0;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.watermarks-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.watermark-text {
  position: absolute;
  white-space: nowrap;
  font-family: Arial, sans-serif;
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  transform-origin: center center;
}

.no-image {
  width: 600px;
  height: 400px;
  border: 2px dashed #ddd;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 18px;
}

.export-canvas {
  display: none;
}

.control-panel {
  width: 350px;
  background-color: #f5f5f5;
  padding: 20px;
  border-radius: 5px;
}

.control-group {
  margin-bottom: 20px;
}

.control-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  color: #333;
}

.control-group input[type="text"],
.control-group select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.control-group input[type="range"] {
  width: 100%;
  margin: 10px 0;
}

.color-picker {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-input {
  width: 50px;
  height: 35px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.export-btn {
  width: 100%;
  padding: 12px;
  background-color: #2196F3;
  color: white;
  border: none;
  border-radius: 5px;
  font-size: 16px;
  cursor: pointer;
  margin-top: 20px;
}

.export-btn:hover {
  background-color: #0b7dda;
}

.export-btn:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

@media (max-width: 1000px) {
  .editor-section {
    flex-direction: column;
    align-items: center;
  }
  
  .preview-container,
  .no-image {
    max-width: 100%;
    width: 100%;
  }
  
  .no-image {
    width: 100%;
    height: 300px;
  }
  
  .control-panel {
    width: 100%;
    max-width: 600px;
  }
}
</style>