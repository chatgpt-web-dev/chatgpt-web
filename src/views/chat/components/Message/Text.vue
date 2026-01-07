<script lang="ts" setup>
import mdKatex from '@vscode/markdown-it-katex'
import hljs from 'highlight.js/lib/common'
import MarkdownIt from 'markdown-it'
import mila from 'markdown-it-link-attributes'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { copyToClip } from '@/utils/copy'
import ImagePreview from './ImagePreview.vue'

const props = defineProps<Props>()

const { t } = useI18n()

interface Props {
  inversion?: boolean
  error?: boolean
  text?: string
  images?: string[]
  toolImages?: string[] // Local file names from AI-generated images (stored as local file names, e.g., "image-xxx.png")
  loading?: boolean
  asRawText?: boolean
}

const { isMobile } = useBasicLayout()

const textRef = ref<HTMLElement>()

// Image preview state
const previewVisible = ref(false)
const previewImages = ref<string[]>([]) // 所有预览图片URL
const previewImageNames = ref<string[]>([]) // 所有预览图片名称
const currentImageIndex = ref(0) // 当前图片索引

// Open image preview with multi-image support
function openImagePreview(url: string, name: string, _imageType: 'upload' | 'tool' = 'upload', index?: number) {
  // Collect all images.
  const allImages: string[] = []
  const allNames: string[] = []

  // Add user-uploaded images.
  if (props.images && props.images.length > 0) {
    props.images.forEach((v, _i) => {
      allImages.push(getImageUrl(v))
      allNames.push(getImageName(v))
    })
  }

  // Add AI-generated images.
  if (props.toolImages && props.toolImages.length > 0) {
    props.toolImages.forEach((v, _i) => {
      allImages.push(getImageUrl(v))
      allNames.push(getImageName(v))
    })
  }

  previewImages.value = allImages
  previewImageNames.value = allNames

  // Determine the current image index.
  if (index !== undefined) {
    currentImageIndex.value = index
  }
  else {
    // Find index by URL.
    const foundIndex = allImages.findIndex(img => img === url)
    currentImageIndex.value = foundIndex >= 0 ? foundIndex : 0
  }

  previewVisible.value = true
}

// Get full image URL
function getImageUrl(v: string): string {
  if (v.startsWith('data:image/')) {
    return v
  }
  // If already a full URL (http/https), return as-is.
  if (v.startsWith('http://') || v.startsWith('https://')) {
    return v
  }
  // Otherwise use the local path.
  return `/uploads/${v}`
}

// Get image name from URL
function getImageName(v: string): string {
  if (v.startsWith('data:image/')) {
    return 'image.png'
  }
  return v.split('/').pop() || 'image.png'
}

const mdi = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }
    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, { blockClass: 'katexmath-block rounded-md p-[10px]', errorColor: ' #cc0000' })

const wrapClass = computed(() => {
  return [
    'text-wrap',
    'min-w-[20px]',
    'rounded-md',
    isMobile.value ? 'p-2' : 'px-3 py-2',
    props.inversion ? 'bg-[#d2f9d1]' : 'bg-[#f4f6f8]',
    props.inversion ? 'dark:bg-[#a1dc95]' : 'dark:bg-[#1e1e20]',
    props.inversion ? 'message-request' : 'message-reply',
    { 'text-red-500': props.error },
  ]
})

const text = computed(() => {
  const value = props.text ?? ''
  if (!props.asRawText) {
    const rendered = mdi.render(value)
    // If markdown is empty, render a p tag to ensure cursor can be displayed
    return rendered.trim() === '' ? '<p></p>' : rendered
  }
  return value
})

function highlightBlock(str: string, lang?: string) {
  return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang}</span><span class="code-block-header__copy">${t('chat.copyCode')}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`
}

function addCopyEvents() {
  if (textRef.value) {
    const copyBtn = textRef.value.querySelectorAll('.code-block-header__copy')
    copyBtn.forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.parentElement?.nextElementSibling?.textContent
        if (code) {
          copyToClip(code).then(() => {
            btn.textContent = '复制成功'
            setTimeout(() => {
              btn.textContent = '复制代码'
            }, 1000)
          })
        }
      })
    })
  }
}

function removeCopyEvents() {
  if (textRef.value) {
    const copyBtn = textRef.value.querySelectorAll('.code-block-header__copy')
    copyBtn.forEach((btn) => {
      btn.removeEventListener('click', () => {})
    })
  }
}

onMounted(() => {
  addCopyEvents()
})

onUpdated(() => {
  addCopyEvents()
})

onUnmounted(() => {
  removeCopyEvents()
})
</script>

<template>
  <div class="text-black" :class="wrapClass">
    <div ref="textRef" class="leading-relaxed break-words">
      <div v-if="!inversion" class="flex items-end">
        <div v-if="!asRawText" class="w-full markdown-body" :class="{ 'markdown-body-generate': loading }" v-html="text" />
        <div v-else class="w-full whitespace-pre-wrap break-words" v-text="text" />
      </div>
      <div v-else class="w-full whitespace-pre-wrap break-words" v-text="text" />
      <!-- User uploaded images -->
      <div class="flex flex-wrap gap-2 mt-2">
        <div
          v-for="(v, i) of images"
          :key="`upload-${i}`"
          class="cursor-pointer hover:opacity-80 transition-opacity"
          @click="openImagePreview(getImageUrl(v), getImageName(v), 'upload', i)"
        >
          <img :src="getImageUrl(v)" alt="" width="160px" class="rounded border border-gray-300">
        </div>
        <!-- AI-generated images from tool calls (local file names or base64 for backward compatibility) -->
        <div
          v-for="(v, i) of toolImages"
          :key="`tool-${i}`"
          class="cursor-pointer hover:opacity-80 transition-opacity"
          @click="openImagePreview(getImageUrl(v), getImageName(v), 'tool', images ? images.length + i : i)"
        >
          <img :src="getImageUrl(v)" alt="" width="160px" class="rounded border border-gray-300">
        </div>
      </div>
    </div>

    <!-- Image preview component -->
    <ImagePreview
      :visible="previewVisible"
      :images="previewImages"
      :image-names="previewImageNames"
      :current-index="currentImageIndex"
      @update:visible="previewVisible = $event"
      @update:current-index="currentImageIndex = $event"
      @close="previewVisible = false"
    />
  </div>
</template>

<style lang="less">
@import url(./style.less);
</style>
