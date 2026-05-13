<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import JSZip from 'jszip';

type Mode = 'single' | 'batch';

interface ImageItem {
  file: File;
  url: string;
  name: string;
  size: string;
}

const mode = ref<Mode>('single');

// 单图模式状态
const singleImageUrl = ref<string>('');
const singleImageEl = ref<HTMLImageElement | null>(null);
const singlePreviewContainer = ref<HTMLElement | null>(null);
const singleExportCanvas = ref<HTMLCanvasElement | null>(null);

// 批量模式状态
const batchImages = ref<ImageItem[]>([]);
const batchSelectedIndex = ref(0);
const batchPreviewContainer = ref<HTMLElement | null>(null);
const batchProcessing = ref(false);
const batchProgress = ref(0);
const batchTotal = ref(0);
const isDragOver = ref(false);

// 水印参数（共用）
const watermarkText = ref('水印文字');
const watermarkSize = ref(30);
const watermarkOpacity = ref(50);
const watermarkColor = ref('#ffffff');
const watermarkSpacingX = ref(80);
const watermarkSpacingY = ref(60);
const watermarkAngle = ref(-30);

// 导出参数（共用）
const exportFormat = ref('png');
const exportQuality = ref(0.9);

// 预览水印位置
const previewWatermarks = ref<Array<{ x: number; y: number }>>([]);

// 当前预览容器
const activePreviewContainer = computed(() => {
  return mode.value === 'single' ? singlePreviewContainer.value : batchPreviewContainer.value;
});

// 单图预览容器样式
const singleContainerStyle = computed(() => {
  if (!singleImageEl.value) return {};
  const img = singleImageEl.value;
  return {
    width: '600px',
    height: `${(img.height / img.width) * 600}px`,
  };
});

const batchContainerStyleSync = ref<{ width: string; height: string } | Record<string, never>>({});

const updateBatchContainerStyle = () => {
  const item = batchImages.value[batchSelectedIndex.value];
  if (!item) {
    batchContainerStyleSync.value = {};
    return;
  }
  const img = new Image();
  img.onload = () => {
    batchContainerStyleSync.value = {
      width: '600px',
      height: `${(img.height / img.width) * 600}px`,
    };
    nextTick(() => calculatePreviewWatermarks());
  };
  img.src = item.url;
};

// 格式化文件大小
const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// 计算预览水印位置
const calculatePreviewWatermarks = () => {
  const container = activePreviewContainer.value;
  if (!container || !watermarkText.value) {
    previewWatermarks.value = [];
    return;
  }

  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  const spacingX = Math.max(20, watermarkSpacingX.value * 0.4);
  const spacingY = Math.max(15, watermarkSpacingY.value * 0.4);

  const marks: Array<{ x: number; y: number }> = [];

  for (let y = -spacingY; y < containerHeight + spacingY; y += spacingY) {
    for (let x = -spacingX; x < containerWidth + spacingX; x += spacingX) {
      const offsetX = (y / spacingY) % 2 === 0 ? spacingX / 2 : 0;
      marks.push({ x: x + offsetX, y });
    }
  }

  previewWatermarks.value = marks;
};

// 公共水印绘制函数
const drawWatermarkToCanvas = (
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  options: {
    text: string;
    size: number;
    opacity: number;
    color: string;
    spacingX: number;
    spacingY: number;
    angle: number;
  }
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  ctx.drawImage(img, 0, 0);

  if (!options.text) return;

  ctx.save();
  ctx.globalAlpha = options.opacity / 100;
  ctx.fillStyle = options.color;
  ctx.font = `bold ${options.size}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((options.angle * Math.PI) / 180);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  for (let y = -options.spacingY; y < canvas.height + options.spacingY; y += options.spacingY) {
    for (let x = -options.spacingX; x < canvas.width + options.spacingX; x += options.spacingX) {
      const offsetX = Math.floor(y / options.spacingY) % 2 === 0 ? options.spacingX / 2 : 0;
      ctx.fillText(options.text, x + offsetX, y);
    }
  }

  ctx.restore();
};

// 获取 MIME 类型
const getMimeType = (format: string): string => {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
};

// 获取文件扩展名
const getExtension = (format: string): string => {
  if (format === 'jpeg') return 'jpg';
  return format;
};

// ========== 单图模式 ==========

const handleSingleUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    const file = target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      singleImageUrl.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const onSingleImageLoad = () => {
  if (singleImageEl.value) {
    nextTick(() => {
      calculatePreviewWatermarks();
    });
  }
};

const exportSingleImage = () => {
  if (!singleExportCanvas.value || !singleImageEl.value) return;

  const canvas = singleExportCanvas.value;
  const img = singleImageEl.value;

  drawWatermarkToCanvas(canvas, img, {
    text: watermarkText.value,
    size: watermarkSize.value,
    opacity: watermarkOpacity.value,
    color: watermarkColor.value,
    spacingX: watermarkSpacingX.value,
    spacingY: watermarkSpacingY.value,
    angle: watermarkAngle.value,
  });

  setTimeout(() => {
    const mimeType = getMimeType(exportFormat.value);
    const quality = exportFormat.value === 'png' ? undefined : exportQuality.value;
    const dataUrl = canvas.toDataURL(mimeType, quality);

    const link = document.createElement('a');
    link.download = `watermarked-image.${getExtension(exportFormat.value)}`;
    link.href = dataUrl;
    link.click();
  }, 100);
};

// ========== 批量模式 ==========

const handleBatchUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    addBatchFiles(Array.from(target.files));
  }
};

const addBatchFiles = (files: File[]) => {
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  imageFiles.forEach((file) => {
    const url = URL.createObjectURL(file);
    batchImages.value.push({
      file,
      url,
      name: file.name,
      size: formatSize(file.size),
    });
  });
  if (batchImages.value.length > 0 && batchSelectedIndex.value >= batchImages.value.length) {
    batchSelectedIndex.value = 0;
  }
  if (batchImages.value.length > 0) {
    updateBatchContainerStyle();
  }
};

const removeBatchImage = (index: number) => {
  const item = batchImages.value[index];
  URL.revokeObjectURL(item.url);
  batchImages.value.splice(index, 1);
  if (batchSelectedIndex.value >= batchImages.value.length) {
    batchSelectedIndex.value = Math.max(0, batchImages.value.length - 1);
  }
  updateBatchContainerStyle();
};

const selectBatchImage = (index: number) => {
  batchSelectedIndex.value = index;
  updateBatchContainerStyle();
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;
  if (event.dataTransfer?.files) {
    addBatchFiles(Array.from(event.dataTransfer.files));
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = () => {
  isDragOver.value = false;
};

const exportBatchImages = async () => {
  if (batchImages.value.length === 0) return;

  batchProcessing.value = true;
  batchProgress.value = 0;
  batchTotal.value = batchImages.value.length;

  const zip = new JSZip();
  const offscreenCanvas = document.createElement('canvas');

  for (let i = 0; i < batchImages.value.length; i++) {
    const item = batchImages.value[i];

    try {
      const img = await loadImage(item.url);
      drawWatermarkToCanvas(offscreenCanvas, img, {
        text: watermarkText.value,
        size: watermarkSize.value,
        opacity: watermarkOpacity.value,
        color: watermarkColor.value,
        spacingX: watermarkSpacingX.value,
        spacingY: watermarkSpacingY.value,
        angle: watermarkAngle.value,
      });

      const mimeType = getMimeType(exportFormat.value);
      const quality = exportFormat.value === 'png' ? undefined : exportQuality.value;

      const blob = await canvasToBlob(offscreenCanvas, mimeType, quality ?? 0.92);
      if (blob) {
        const baseName = item.name.replace(/\.[^.]+$/, '');
        const ext = getExtension(exportFormat.value);
        zip.file(`${baseName}_watermarked.${ext}`, blob);
      }
    } catch {
      // skip failed images
    }

    batchProgress.value = i + 1;
  }

  try {
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = `watermarked-images.zip`;
    link.href = URL.createObjectURL(content);
    link.click();
    URL.revokeObjectURL(link.href);
  } finally {
    batchProcessing.value = false;
  }
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> => {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
};

// ========== 监听参数变化 ==========

watch(
  [watermarkText, watermarkSize, watermarkOpacity, watermarkSpacingX, watermarkSpacingY, watermarkAngle],
  () => {
    nextTick(() => {
      calculatePreviewWatermarks();
    });
  }
);

watch(mode, () => {
  nextTick(() => {
    calculatePreviewWatermarks();
  });
});

onMounted(() => {
  window.addEventListener('resize', calculatePreviewWatermarks);
});
</script>

<template>
  <div class="app-container">
    <h1>图片加水印工具</h1>

    <!-- 模式切换 -->
    <div class="mode-tabs">
      <button :class="{ active: mode === 'single' }" @click="mode = 'single'">单图模式</button>
      <button :class="{ active: mode === 'batch' }" @click="mode = 'batch'">批量模式</button>
    </div>

    <!-- ========== 单图模式 ========== -->
    <template v-if="mode === 'single'">
      <div class="upload-section">
        <input type="file" id="single-upload" accept="image/*" @change="handleSingleUpload" class="file-input" />
        <label for="single-upload" class="upload-label">选择图片</label>
      </div>

      <div class="editor-section">
        <div class="preview-wrapper">
          <div v-if="singleImageUrl" ref="singlePreviewContainer" class="preview-container" :style="singleContainerStyle">
            <img :src="singleImageUrl" class="preview-image" @load="onSingleImageLoad" ref="singleImageEl" />
            <div class="watermarks-overlay" :style="{ opacity: watermarkOpacity / 100 }">
              <span
                v-for="(mark, index) in previewWatermarks"
                :key="index"
                class="watermark-text"
                :style="{
                  left: mark.x + 'px',
                  top: mark.y + 'px',
                  fontSize: Math.max(12, watermarkSize * 0.4) + 'px',
                  transform: `rotate(${watermarkAngle}deg)`,
                  color: watermarkColor,
                }"
              >
                {{ watermarkText }}
              </span>
            </div>
          </div>
          <div class="no-image" v-else>请上传图片</div>
          <canvas ref="singleExportCanvas" class="export-canvas"></canvas>
        </div>

        <div class="control-panel">
          <div class="control-group">
            <label>水印文字</label>
            <input type="text" v-model="watermarkText" placeholder="输入水印文字" />
          </div>
          <div class="control-group">
            <label>水印颜色</label>
            <div class="color-picker">
              <input type="color" v-model="watermarkColor" class="color-input" />
              <span>{{ watermarkColor }}</span>
            </div>
          </div>
          <div class="control-group">
            <label>文字大小: {{ watermarkSize }}px</label>
            <input type="range" min="10" max="100" v-model.number="watermarkSize" />
          </div>
          <div class="control-group">
            <label>水印密度 X: {{ watermarkSpacingX }}px</label>
            <input type="range" min="20" max="200" v-model.number="watermarkSpacingX" />
          </div>
          <div class="control-group">
            <label>水印密度 Y: {{ watermarkSpacingY }}px</label>
            <input type="range" min="20" max="200" v-model.number="watermarkSpacingY" />
          </div>
          <div class="control-group">
            <label>水印角度: {{ watermarkAngle }}°</label>
            <input type="range" min="-90" max="90" v-model.number="watermarkAngle" />
          </div>
          <div class="control-group">
            <label>透明度: {{ watermarkOpacity }}%</label>
            <input type="range" min="10" max="100" v-model.number="watermarkOpacity" />
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
            <input type="range" min="0.1" max="1" step="0.1" v-model.number="exportQuality" />
          </div>
          <button class="export-btn" @click="exportSingleImage" :disabled="!singleImageUrl">导出图片</button>
        </div>
      </div>
    </template>

    <!-- ========== 批量模式 ========== -->
    <template v-if="mode === 'batch'">
      <!-- 拖拽上传区域 -->
      <div
        class="drop-zone"
        :class="{ 'drag-over': isDragOver }"
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
      >
        <input type="file" id="batch-upload" accept="image/*" multiple @change="handleBatchUpload" class="file-input" />
        <label for="batch-upload" class="drop-zone-label">
          <span class="drop-icon">📁</span>
          <span>点击或拖拽图片到此处上传（支持多选）</span>
        </label>
      </div>

      <div class="editor-section" v-if="batchImages.length > 0">
        <!-- 左侧：文件列表 + 预览 -->
        <div class="batch-left">
          <!-- 文件列表 -->
          <div class="file-list">
            <div class="file-list-header">
              <span>已选图片 ({{ batchImages.length }})</span>
              <button class="clear-btn" @click="batchImages = []; batchSelectedIndex = 0">清空</button>
            </div>
            <div class="file-list-body">
              <div
                v-for="(item, index) in batchImages"
                :key="index"
                class="file-item"
                :class="{ selected: index === batchSelectedIndex }"
                @click="selectBatchImage(index)"
              >
                <img :src="item.url" class="file-thumb" />
                <div class="file-info">
                  <span class="file-name">{{ item.name }}</span>
                  <span class="file-size">{{ item.size }}</span>
                </div>
                <button class="file-remove" @click.stop="removeBatchImage(index)">✕</button>
              </div>
            </div>
          </div>

          <!-- 预览区域 -->
          <div
            v-if="batchImages.length > 0"
            ref="batchPreviewContainer"
            class="preview-container"
            :style="batchContainerStyleSync"
          >
            <img :src="batchImages[batchSelectedIndex]?.url" class="preview-image" />
            <div class="watermarks-overlay" :style="{ opacity: watermarkOpacity / 100 }">
              <span
                v-for="(mark, index) in previewWatermarks"
                :key="index"
                class="watermark-text"
                :style="{
                  left: mark.x + 'px',
                  top: mark.y + 'px',
                  fontSize: Math.max(12, watermarkSize * 0.4) + 'px',
                  transform: `rotate(${watermarkAngle}deg)`,
                  color: watermarkColor,
                }"
              >
                {{ watermarkText }}
              </span>
            </div>
          </div>
        </div>

        <!-- 右侧：控制面板 -->
        <div class="control-panel">
          <div class="control-group">
            <label>水印文字</label>
            <input type="text" v-model="watermarkText" placeholder="输入水印文字" />
          </div>
          <div class="control-group">
            <label>水印颜色</label>
            <div class="color-picker">
              <input type="color" v-model="watermarkColor" class="color-input" />
              <span>{{ watermarkColor }}</span>
            </div>
          </div>
          <div class="control-group">
            <label>文字大小: {{ watermarkSize }}px</label>
            <input type="range" min="10" max="100" v-model.number="watermarkSize" />
          </div>
          <div class="control-group">
            <label>水印密度 X: {{ watermarkSpacingX }}px</label>
            <input type="range" min="20" max="200" v-model.number="watermarkSpacingX" />
          </div>
          <div class="control-group">
            <label>水印密度 Y: {{ watermarkSpacingY }}px</label>
            <input type="range" min="20" max="200" v-model.number="watermarkSpacingY" />
          </div>
          <div class="control-group">
            <label>水印角度: {{ watermarkAngle }}°</label>
            <input type="range" min="-90" max="90" v-model.number="watermarkAngle" />
          </div>
          <div class="control-group">
            <label>透明度: {{ watermarkOpacity }}%</label>
            <input type="range" min="10" max="100" v-model.number="watermarkOpacity" />
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
            <input type="range" min="0.1" max="1" step="0.1" v-model.number="exportQuality" />
          </div>

          <!-- 批量进度 -->
          <div class="batch-progress" v-if="batchProcessing">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: (batchProgress / batchTotal) * 100 + '%' }"></div>
            </div>
            <span class="progress-text">处理中: {{ batchProgress }} / {{ batchTotal }}</span>
          </div>

          <button class="export-btn" @click="exportBatchImages" :disabled="batchImages.length === 0 || batchProcessing">
            {{ batchProcessing ? '处理中...' : '批量导出 (ZIP)' }}
          </button>
        </div>
      </div>

      <div class="no-image" v-if="batchImages.length === 0">请上传图片文件</div>
    </template>
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
  margin-bottom: 20px;
}

.mode-tabs {
  display: flex;
  justify-content: center;
  gap: 0;
  margin-bottom: 24px;
}

.mode-tabs button {
  padding: 10px 32px;
  border: 2px solid #4CAF50;
  background: white;
  color: #4CAF50;
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-tabs button:first-child {
  border-radius: 6px 0 0 6px;
}

.mode-tabs button:last-child {
  border-radius: 0 6px 6px 0;
}

.mode-tabs button.active {
  background: #4CAF50;
  color: white;
}

.upload-section {
  text-align: center;
  margin-bottom: 24px;
}

.file-input {
  display: none;
}

.upload-label {
  display: inline-block;
  padding: 10px 24px;
  background-color: #4CAF50;
  color: white;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
}

.upload-label:hover {
  background-color: #45a049;
}

.drop-zone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  margin-bottom: 24px;
  transition: all 0.2s;
  cursor: pointer;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.05);
}

.drop-zone-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #666;
  font-size: 16px;
}

.drop-icon {
  font-size: 36px;
}

.editor-section {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: center;
}

.preview-wrapper {
  position: relative;
}

.batch-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.file-list {
  width: 600px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  background: #fafafa;
}

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #f0f0f0;
  font-weight: bold;
  font-size: 14px;
  color: #333;
}

.clear-btn {
  background: none;
  border: none;
  color: #e53935;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 8px;
  border-radius: 4px;
}

.clear-btn:hover {
  background: rgba(229, 57, 53, 0.1);
}

.file-list-body {
  max-height: 200px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #eee;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background: #e8f5e9;
}

.file-item.selected {
  background: #c8e6c9;
}

.file-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 11px;
  color: #999;
}

.file-remove {
  background: none;
  border: none;
  color: #999;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
}

.file-remove:hover {
  background: rgba(229, 57, 53, 0.1);
  color: #e53935;
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
  height: 300px;
  border: 2px dashed #ddd;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 18px;
  margin: 0 auto;
}

.export-canvas {
  display: none;
}

.control-panel {
  width: 350px;
  background-color: #f5f5f5;
  padding: 20px;
  border-radius: 5px;
  flex-shrink: 0;
}

.control-group {
  margin-bottom: 18px;
}

.control-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  color: #333;
  font-size: 13px;
}

.control-group input[type='text'],
.control-group select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

.control-group input[type='range'] {
  width: 100%;
  margin: 8px 0;
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

.batch-progress {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #66BB6A);
  border-radius: 10px;
  transition: width 0.3s;
}

.progress-text {
  display: block;
  text-align: center;
  font-size: 13px;
  color: #666;
  margin-top: 6px;
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
  margin-top: 12px;
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
  .file-list,
  .no-image {
    max-width: 100%;
    width: 100%;
  }

  .no-image {
    width: 100%;
    height: 200px;
  }

  .control-panel {
    width: 100%;
    max-width: 600px;
  }
}
</style>
