;--- functions
(function_item name: (identifier) @function.name) @function.def

;--- classes
(struct_item name: (type_identifier) @class.name) @class.def
(enum_item name: (type_identifier) @class.name) @class.def
(impl_item type: (type_identifier) @class.name) @class.def

;--- imports
(use_declaration (scoped_identifier) @import.source)
(use_declaration (identifier) @import.source)

;--- entry_points
(function_item name: (identifier) @entry (#eq? @entry "main"))