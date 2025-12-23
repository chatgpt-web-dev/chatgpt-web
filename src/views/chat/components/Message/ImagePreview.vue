<script lang="ts" setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'

interface Props {
  visible: boolean
  images: string[]
  imageNames: string[]
  currentIndex: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'update:currentIndex': [value: number]
  'close': []
}>()

const { isMobile: _isMobile } = useBasicLayout()

// 图片缩放状态
const imageScale = ref(1)
const minScale = 0.2
const maxScale = 5

// 缩略图容器引用
const thumbnailContainerRef = ref<HTMLElement | null>(null)
// 图片加载状态
const imageLoaded = ref(false)
const imageLoading = ref(false)
// 是否需要显示滚动条
const needsScrollbar = ref(false)
// 窗口大小变化监听器
const resizeObserver = ref<ResizeObserver | null>(null)

const totalImages = computed(() => props.images.length)
const currentImageUrl = computed(() => props.images[props.currentIndex] || '')
const currentImageName = computed(() => props.imageNames[props.currentIndex] || 'image.png')

// 关闭预览
function closePreview() {
  emit('update:visible', false)
  emit('close')
}

// 键盘事件处理
function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closePreview()
  }
  else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    prevImage()
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    nextImage()
  }
}

// 滚轮缩放处理
function handleWheel(event: WheelEvent) {
  if (!props.visible)
    return

  event.preventDefault()

  const delta = event.deltaY
  const zoomStep = 0.1

  if (delta < 0) {
    // 向上滚动，放大
    if (imageScale.value < maxScale) {
      imageScale.value = Math.min(imageScale.value + zoomStep, maxScale)
    }
  }
  else {
    // 向下滚动，缩小
    if (imageScale.value > minScale) {
      imageScale.value = Math.max(imageScale.value - zoomStep, minScale)
    }
  }
}

// 缩放控制
function zoomIn() {
  if (imageScale.value < maxScale) {
    imageScale.value = Math.min(imageScale.value + 0.2, maxScale)
  }
}

function zoomOut() {
  if (imageScale.value > minScale) {
    imageScale.value = Math.max(imageScale.value - 0.2, minScale)
  }
}

function resetZoom() {
  imageScale.value = 1
}

// 预加载图片
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })
}

// 预加载相邻图片
async function preloadAdjacentImages() {
  if (totalImages.value <= 1)
    return

  const preloadPromises: Promise<void>[] = []
  const current = props.currentIndex

  // 预加载前一张
  if (current > 0) {
    preloadPromises.push(preloadImage(props.images[current - 1]))
  }
  else if (totalImages.value > 1) {
    // 如果是第一张，预加载最后一张
    preloadPromises.push(preloadImage(props.images[totalImages.value - 1]))
  }

  // 预加载后一张
  if (current < totalImages.value - 1) {
    preloadPromises.push(preloadImage(props.images[current + 1]))
  }
  else if (totalImages.value > 1) {
    // 如果是最后一张，预加载第一张
    preloadPromises.push(preloadImage(props.images[0]))
  }

  await Promise.all(preloadPromises).catch(() => {
    // 忽略预加载错误
  })
}

// 检查是否需要滚动条
function checkScrollbarNeeded() {
  nextTick(() => {
    if (!thumbnailContainerRef.value)
      return

    const container = thumbnailContainerRef.value
    needsScrollbar.value = container.scrollWidth > container.clientWidth
  })
}

// 滚动缩略图到可见位置
function scrollThumbnailIntoView(index: number) {
  nextTick(() => {
    if (!thumbnailContainerRef.value)
      return

    const container = thumbnailContainerRef.value
    const thumbnails = container.querySelectorAll('div[data-thumbnail-index]')
    const targetThumbnail = thumbnails[index] as HTMLElement

    if (targetThumbnail) {
      const containerRect = container.getBoundingClientRect()
      const thumbnailRect = targetThumbnail.getBoundingClientRect()
      const scrollLeft = container.scrollLeft
      const thumbnailLeft = thumbnailRect.left - containerRect.left + scrollLeft
      const thumbnailWidth = thumbnailRect.width
      const containerWidth = containerRect.width
      // 为边框和缩放效果留出额外空间（约12px）
      const padding = 12

      // 如果缩略图在左侧不可见
      if (thumbnailLeft < scrollLeft + padding) {
        container.scrollTo({ left: thumbnailLeft - padding, behavior: 'smooth' })
      }
      // 如果缩略图在右侧不可见
      else if (thumbnailLeft + thumbnailWidth > scrollLeft + containerWidth - padding) {
        container.scrollTo({
          left: thumbnailLeft + thumbnailWidth - containerWidth + padding,
          behavior: 'smooth',
        })
      }
    }
  })
}

// 切换图片的通用逻辑
async function switchImage(newIndex: number) {
  if (newIndex < 0 || newIndex >= totalImages.value)
    return

  imageLoading.value = true
  imageLoaded.value = false
  emit('update:currentIndex', newIndex)
  imageScale.value = 1
  await preloadAdjacentImages()
  scrollThumbnailIntoView(newIndex)
}

// 图片导航
function prevImage() {
  if (totalImages.value <= 1)
    return

  const newIndex = props.currentIndex > 0
    ? props.currentIndex - 1
    : totalImages.value - 1
  switchImage(newIndex)
}

function nextImage() {
  if (totalImages.value <= 1)
    return

  const newIndex = props.currentIndex < totalImages.value - 1
    ? props.currentIndex + 1
    : 0
  switchImage(newIndex)
}

// 直接跳转到指定图片
function goToImage(index: number) {
  switchImage(index)
}

// 图片加载完成处理
function handleImageLoad() {
  imageLoaded.value = true
  imageLoading.value = false
}

function handleImageError() {
  imageLoaded.value = true
  imageLoading.value = false
}

// 下载图片
function downloadImage(url: string, name: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = name || 'image.png'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// 添加/移除键盘事件监听器
function addKeyListener() {
  document.addEventListener('keydown', handleKeyDown)
}

function removeKeyListener() {
  document.removeEventListener('keydown', handleKeyDown)
}

// 监听visible变化
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    addKeyListener()
    imageScale.value = 1
    imageLoaded.value = false
    imageLoading.value = true
    await preloadAdjacentImages()
    nextTick(() => {
      scrollThumbnailIntoView(props.currentIndex)
      checkScrollbarNeeded()
      setupResizeObserver()
    })
  }
  else {
    removeKeyListener()
    if (resizeObserver.value) {
      resizeObserver.value.disconnect()
      resizeObserver.value = null
    }
  }
})

// 监听currentIndex变化
watch(() => props.currentIndex, () => {
  if (props.visible) {
    preloadAdjacentImages()
    scrollThumbnailIntoView(props.currentIndex)
  }
})

// 监听图片数量变化，检查是否需要滚动条
watch(() => props.images.length, () => {
  if (props.visible) {
    checkScrollbarNeeded()
  }
})

// 设置窗口大小变化监听
function setupResizeObserver() {
  if (resizeObserver.value) {
    resizeObserver.value.disconnect()
    resizeObserver.value = null
  }

  nextTick(() => {
    if (thumbnailContainerRef.value) {
      resizeObserver.value = new ResizeObserver(() => {
        checkScrollbarNeeded()
      })
      resizeObserver.value.observe(thumbnailContainerRef.value!)
    }
  })
}

// 组件卸载时清理
onUnmounted(() => {
  removeKeyListener()
  if (resizeObserver.value) {
    resizeObserver.value.disconnect()
  }
})
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity"
    @click.self="closePreview"
  >
    <div class="relative w-full h-full flex flex-col items-center justify-center p-4">
      <!-- Zoom controls at top -->
      <div class="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-3 py-2 z-10">
        <!-- Image position indicator -->
        <div v-if="totalImages > 1" class="text-white text-sm font-medium px-2">
          {{ currentIndex + 1 }} / {{ totalImages }}
        </div>

        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          title="缩小"
          @click="zoomOut"
        >
          <span class="text-white text-lg font-bold">-</span>
        </button>
        <span class="text-white text-sm min-w-[40px] text-center">{{ Math.round(imageScale * 100) }}%</span>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          title="放大"
          @click="zoomIn"
        >
          <span class="text-white text-lg font-bold">+</span>
        </button>
        <button
          class="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors ml-2"
          title="重置缩放"
          @click="resetZoom"
        >
          <span class="text-white text-xs">↺</span>
        </button>
        <!-- Download button -->
        <button
          class="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition-colors"
          @click="downloadImage(currentImageUrl, currentImageName)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      <!-- Main image container with navigation -->
      <div class="flex-1 flex items-center justify-center w-full overflow-hidden relative">
        <!-- Previous button -->
        <button
          v-if="totalImages > 1"
          class="absolute left-2 md:left-4 z-20 w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md transition-colors"
          title="上一张 (←)"
          @click.stop="prevImage"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white md:w-20 md:h-20">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <!-- Image with click to close -->
        <div
          class="w-full h-full flex items-center justify-center relative"
          @wheel="handleWheel"
          @click="closePreview"
        >
          <!-- Loading indicator -->
          <div
            v-if="imageLoading && !imageLoaded"
            class="absolute inset-0 flex items-center justify-center"
          >
            <div class="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <img
            :src="currentImageUrl"
            alt=""
            class="max-w-full max-h-[70vh] object-contain transition-all duration-300 cursor-zoom-in"
            :class="{
              'opacity-0': imageLoading && !imageLoaded,
              'opacity-100': imageLoaded || !imageLoading,
            }"
            :style="{ transform: `scale(${imageScale})` }"
            @load="handleImageLoad"
            @error="handleImageError"
          >
        </div>

        <!-- Next button -->
        <button
          v-if="totalImages > 1"
          class="absolute right-2 md:right-4 z-20 w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md transition-colors"
          title="下一张 (→)"
          @click.stop="nextImage"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white md:w-20 md:h-20">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <!-- Thumbnail navigation at bottom -->
      <div v-if="totalImages > 1" class="absolute bottom-4 left-1/2 transform -translate-x-1/2">
        <div class="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-3">
          <div
            ref="thumbnailContainerRef"
            class="flex items-center gap-2 overflow-x-auto overflow-y-visible max-w-[400px] md:max-w-[500px] thumbnail-scrollbar thumbnail-container"
            :class="{ 'show-scrollbar': needsScrollbar }"
          >
            <div
              v-for="(img, index) in images"
              :key="index"
              :data-thumbnail-index="index"
              class="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded overflow-visible cursor-pointer transition-all duration-200 relative"
              :class="index === currentIndex ? 'thumbnail-active' : 'thumbnail-inactive'"
              @click.stop="goToImage(index)"
            >
              <img :src="img" alt="" class="w-full h-full object-cover rounded">
            </div>
          </div>
        </div>
      </div>

      <!-- Single thumbnail for single image -->
      <div v-else class="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-3">
        <div class="w-16 h-16 rounded overflow-hidden border-2 border-white/50 shadow-lg">
          <img :src="currentImageUrl" alt="" class="w-full h-full object-cover">
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
// 图片预览相关样式
.cursor-zoom-in {
  cursor: zoom-in;
}

// 当图片放大时改变光标
img[style*="scale"] {
  cursor: grab;
}

img[style*="scale"]:active {
  cursor: grabbing;
}

// 缩略图容器 - 确保有足够空间显示边框和缩放效果
.thumbnail-container {
  min-height: 80px; // 确保有足够高度显示缩放和边框
  padding: 8px 4px; // 上下留空间，左右留空间给边框和缩放
  align-items: center;
}

// 缩略图滚动条 - 默认隐藏，只在需要时显示
.thumbnail-scrollbar {
  scrollbar-width: none; // Firefox
  -ms-overflow-style: none; // IE and Edge

  &::-webkit-scrollbar {
    display: none; // Chrome, Safari, Opera
  }

  // 只在需要滚动且悬停时显示滚动条
  &.show-scrollbar:hover {
    scrollbar-width: thin; // Firefox

    &::-webkit-scrollbar {
      display: block;
      height: 2px; // 更细的滚动条
    }

    &::-webkit-scrollbar-track {
      background: transparent; // 透明轨道
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2); // 更不明显的滚动条
      border-radius: 1px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.35);
    }
  }
}

// 当前激活的缩略图样式 - 更明显的标识
.thumbnail-active {
  border: 3px solid #ffffff !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.4);
  transform: scale(1.12);
  opacity: 1 !important;
  z-index: 10;
  background: rgba(255, 255, 255, 0.1);
  // 确保边框和缩放效果完整显示
  margin: 0 2px; // 左右留空间，避免被裁剪
}

// 非激活的缩略图样式
.thumbnail-inactive {
  border: 1px solid rgba(255, 255, 255, 0.3);
  opacity: 0.6;

  &:hover {
    border-color: rgba(255, 255, 255, 0.6);
    opacity: 0.9;
    transform: scale(1.05);
  }
}
</style>
